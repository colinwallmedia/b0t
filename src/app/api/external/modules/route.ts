import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, checkPermission } from '@/lib/api-key-auth';
import { logAuditEvent } from '@/lib/audit';
import { getModuleRegistry } from '@/lib/workflows/module-registry';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/external/modules
 * List all available modules, or search by ?search=keyword
 */
export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!checkPermission(auth.permissions, 'modules', 'read')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.toLowerCase() ?? '';

    const registry = getModuleRegistry();

    const modules = registry.flatMap((category) =>
      category.modules.flatMap((mod) =>
        mod.functions.map((func) => ({
          path: `${category.name}.${mod.name}.${func.name}`,
          category: category.name,
          module: mod.name,
          function: func.name,
          description: func.description,
          signature: func.signature,
        }))
      )
    );

    const results = search
      ? modules.filter((m) =>
          `${m.path} ${m.description} ${m.signature}`.toLowerCase().includes(search)
        )
      : modules;

    await logAuditEvent({
      apiKeyId: auth.apiKey.id,
      userId: auth.userId,
      action: 'modules.list',
      requestMethod: 'GET',
      requestPath: '/api/external/modules',
      responseStatus: '200',
      metadata: search ? { search } : undefined,
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
    });

    return NextResponse.json({ modules: results, total: results.length });
  } catch (error) {
    logger.error({ error }, 'External API: Failed to list modules');
    return NextResponse.json({ error: 'Failed to list modules' }, { status: 500 });
  }
}
