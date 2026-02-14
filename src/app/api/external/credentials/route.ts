import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, checkPermission } from '@/lib/api-key-auth';
import { logAuditEvent } from '@/lib/audit';
import { listCredentials, storeCredential } from '@/lib/workflows/credentials';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/external/credentials
 * List credential names and types — values are NEVER returned
 */
export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!checkPermission(auth.permissions, 'credentials', 'read')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  try {
    const raw = await listCredentials(auth.userId);

    // Strip sensitive fields — only expose metadata safe for external consumers
    const credentials = raw.map((c) => ({
      id: c.id,
      platform: c.platform,
      name: c.name,
      type: c.type,
      createdAt: c.createdAt,
      lastUsed: c.lastUsed,
    }));

    await logAuditEvent({
      apiKeyId: auth.apiKey.id,
      userId: auth.userId,
      action: 'credentials.list',
      requestMethod: 'GET',
      requestPath: '/api/external/credentials',
      responseStatus: '200',
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
    });

    return NextResponse.json({ credentials });
  } catch (error) {
    logger.error({ error }, 'External API: Failed to list credentials');
    return NextResponse.json({ error: 'Failed to list credentials' }, { status: 500 });
  }
}

/**
 * POST /api/external/credentials
 * Create a new credential (encrypted at rest)
 */
export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!checkPermission(auth.permissions, 'credentials', 'create')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { platform, name, value, type } = body;

    if (!platform || !name || !value || !type) {
      return NextResponse.json(
        { error: 'Validation failed', details: 'platform, name, value, and type are required' },
        { status: 400 }
      );
    }

    const result = await storeCredential(auth.userId, { platform, name, value, type });

    await logAuditEvent({
      apiKeyId: auth.apiKey.id,
      userId: auth.userId,
      action: 'credentials.create',
      resource: result.id,
      requestMethod: 'POST',
      requestPath: '/api/external/credentials',
      responseStatus: '201',
      metadata: { platform, name },
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
    });

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'External API: Failed to create credential');
    return NextResponse.json({ error: 'Failed to create credential' }, { status: 500 });
  }
}
