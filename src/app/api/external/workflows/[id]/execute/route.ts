import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, checkPermission } from '@/lib/api-key-auth';
import { logAuditEvent } from '@/lib/audit';
import { db } from '@/lib/db';
import { workflowsTable } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { queueWorkflowExecution, isWorkflowQueueAvailable } from '@/lib/workflows/workflow-queue';
import { executeWorkflow } from '@/lib/workflows/executor';

export const dynamic = 'force-dynamic';

/**
 * POST /api/external/workflows/[id]/execute
 * Execute a workflow by ID
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!checkPermission(auth.permissions, 'workflows', 'execute')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const [workflow] = await db
      .select({ id: workflowsTable.id, userId: workflowsTable.userId })
      .from(workflowsTable)
      .where(
        and(
          eq(workflowsTable.id, id),
          eq(workflowsTable.userId, auth.userId)
        )
      )
      .limit(1);

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const triggerData = body.triggerData ?? body.params ?? {};
    const triggerType = 'manual';

    let result: { success: boolean; jobId?: string; queued?: boolean; output?: unknown; error?: string; errorStep?: string };

    if (isWorkflowQueueAvailable()) {
      const { jobId, queued } = await queueWorkflowExecution(
        id,
        auth.userId,
        triggerType,
        triggerData
      );
      result = { success: true, jobId, queued };
    } else {
      result = await executeWorkflow(id, auth.userId, triggerType, triggerData);
    }

    await logAuditEvent({
      apiKeyId: auth.apiKey.id,
      userId: auth.userId,
      action: 'workflows.execute',
      resource: id,
      requestMethod: 'POST',
      requestPath: `/api/external/workflows/${id}/execute`,
      responseStatus: result.success ? '200' : '500',
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, errorStep: result.errorStep },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, output: result.output, jobId: result.jobId, queued: result.queued });
  } catch (error) {
    logger.error({ error, workflowId: id }, 'External API: Failed to execute workflow');
    return NextResponse.json({ error: 'Failed to execute workflow' }, { status: 500 });
  }
}
