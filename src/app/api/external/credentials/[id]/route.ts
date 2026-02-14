import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, checkPermission } from '@/lib/api-key-auth';
import { logAuditEvent } from '@/lib/audit';
import { deleteCredential } from '@/lib/workflows/credentials';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/external/credentials/[id]
 * Delete a credential by ID
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!checkPermission(auth.permissions, 'credentials', 'delete')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    await deleteCredential(auth.userId, id);

    await logAuditEvent({
      apiKeyId: auth.apiKey.id,
      userId: auth.userId,
      action: 'credentials.delete',
      resource: id,
      requestMethod: 'DELETE',
      requestPath: `/api/external/credentials/${id}`,
      responseStatus: '200',
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error, credentialId: id }, 'External API: Failed to delete credential');
    return NextResponse.json({ error: 'Failed to delete credential' }, { status: 500 });
  }
}
