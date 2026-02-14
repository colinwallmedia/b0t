import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, checkPermission } from '@/lib/api-key-auth';
import { logAuditEvent } from '@/lib/audit';
import { db } from '@/lib/db';
import { workflowRunsTable, workflowsTable } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/external/activity/[id]
 * Get detailed results of a specific workflow run
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!checkPermission(auth.permissions, 'workflows', 'read')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const [run] = await db
      .select({
        id: workflowRunsTable.id,
        workflowId: workflowRunsTable.workflowId,
        workflowName: workflowsTable.name,
        status: workflowRunsTable.status,
        triggerType: workflowRunsTable.triggerType,
        triggerData: workflowRunsTable.triggerData,
        startedAt: workflowRunsTable.startedAt,
        completedAt: workflowRunsTable.completedAt,
        duration: workflowRunsTable.duration,
        output: workflowRunsTable.output,
        error: workflowRunsTable.error,
        errorStep: workflowRunsTable.errorStep,
      })
      .from(workflowRunsTable)
      .innerJoin(workflowsTable, eq(workflowRunsTable.workflowId, workflowsTable.id))
      .where(
        and(
          eq(workflowRunsTable.id, id),
          eq(workflowRunsTable.userId, auth.userId)
        )
      )
      .limit(1);

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    const parsed = {
      ...run,
      output: run.output ? JSON.parse(run.output as string) : null,
      triggerData: run.triggerData ? JSON.parse(run.triggerData as string) : null,
    };

    await logAuditEvent({
      apiKeyId: auth.apiKey.id,
      userId: auth.userId,
      action: 'activity.get',
      resource: id,
      requestMethod: 'GET',
      requestPath: `/api/external/activity/${id}`,
      responseStatus: '200',
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
    });

    return NextResponse.json({ run: parsed });
  } catch (error) {
    logger.error({ error, runId: id }, 'External API: Failed to get activity detail');
    return NextResponse.json({ error: 'Failed to get activity detail' }, { status: 500 });
  }
}
