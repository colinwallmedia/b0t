import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/external/health
 * Public health check endpoint — no auth required
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'b0t',
    timestamp: new Date().toISOString(),
  });
}
