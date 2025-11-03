import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

/**
 * NextAuth.js Middleware
 *
 * This middleware protects routes that require authentication.
 * Configure which routes to protect in the `config.matcher` below.
 */

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthenticated = !!req.auth;

  // Define public routes (no authentication required)
  // Note: Root path "/" is handled by page.tsx which checks auth and redirects appropriately
  const publicRoutes = [
    '/auth/signin',
    '/auth/error',
    '/api/auth',
    '/api/workflows/import-test',  // Test endpoint for development
    '/api/workflows/execute-test', // Test endpoint for development
  ];

  // Check if the current path is public or is the root path
  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Root path is handled by page.tsx, so we allow it through middleware
  const isRootPath = pathname === '/';

  // If route is not public, not root, and user is not authenticated, redirect to signin
  if (!isPublicRoute && !isRootPath && !isAuthenticated) {
    const signInUrl = new URL('/auth/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Allow the request to continue
  return NextResponse.next();
});

/**
 * Configure which routes the middleware should run on
 *
 * Options:
 * 1. Match all routes except static files and API routes:
 *    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
 *
 * 2. Match specific routes:
 *    matcher: ['/dashboard/:path*', '/profile/:path*']
 *
 * 3. Match all routes (current configuration):
 *    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, cat-icon.svg (static files)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|cat-icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
