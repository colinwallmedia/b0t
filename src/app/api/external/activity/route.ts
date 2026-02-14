import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, checkPermission } from '@/lib/api-key-auth';
import { logAuditEvent } from '@/lib/audit';
import { db } from '@/lib/db';
import { workflowRunsTable, workflowsTable } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/external/activity
 * Get execution history for the authenticated user's workflows
 */
export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!checkPermission(auth.permissions, 'workflows', 'read')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));

    const runs = await db
      .select({
        id: workflowRunsTable.id,
        workflowId: workflowRunsTable.workflowId,
        workflowName: workflowsTable.name,
        status: workflowRunsTable.status,
        triggerType: workflowRunsTable.triggerType,
        startedAt: workflowRunsTable.startedAt,
        completedAt: workflowRunsTable.completedAt,
        duration: workflowRunsTable.duration,
        error: workflowRunsTable.error,
        errorStep: workflowRunsTable.errorStep,
      })
      .from(workflowRunsTable)
      .innerJoin(workflowsTable, eq(workflowRunsTable.workflowId, workflowsTable.id))
      .where(eq(workflowRunsTable.userId, auth.userId))
      .orderBy(desc(workflowRunsTable.startedAt))
      .limit(limit);

    await logAuditEvent({
      apiKeyId: auth.apiKey.id,
      userId: auth.userId,
      action: 'activity.list',
      requestMethod: 'GET',
      requestPath: '/api/external/activity',
      responseStatus: '200',
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
    });

    return NextResponse.json({ runs });
  } catch (error) {
    logger.error({ error }, 'External API: Failed to get activity');
    return NextResponse.json({ error: 'Failed to get activity' }, { status: 500 });
  }
}
