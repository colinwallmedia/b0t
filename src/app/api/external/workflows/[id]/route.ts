import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, checkPermission } from '@/lib/api-key-auth';
import { logAuditEvent } from '@/lib/audit';
import { db } from '@/lib/db';
import { workflowsTable } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/external/workflows/[id]
 * Get a single workflow by ID
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
    const [workflow] = await db
      .select()
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

    const parsed = {
      ...workflow,
      config: typeof workflow.config === 'string' ? JSON.parse(workflow.config) : workflow.config,
      trigger: typeof workflow.trigger === 'string' ? JSON.parse(workflow.trigger) : workflow.trigger,
    };

    await logAuditEvent({
      apiKeyId: auth.apiKey.id,
      userId: auth.userId,
      action: 'workflows.get',
      resource: id,
      requestMethod: 'GET',
      requestPath: `/api/external/workflows/${id}`,
      responseStatus: '200',
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
    });

    return NextResponse.json({ workflow: parsed });
  } catch (error) {
    logger.error({ error, workflowId: id }, 'External API: Failed to get workflow');
    return NextResponse.json({ error: 'Failed to get workflow' }, { status: 500 });
  }
}

/**
 * PUT /api/external/workflows/[id]
 * Update a workflow
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!checkPermission(auth.permissions, 'workflows', 'update')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const [existing] = await db
      .select({ id: workflowsTable.id })
      .from(workflowsTable)
      .where(
        and(
          eq(workflowsTable.id, id),
          eq(workflowsTable.userId, auth.userId)
        )
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.status !== undefined) updates.status = body.status;
    if (body.config !== undefined) {
      updates.config = typeof body.config === 'string' ? body.config : JSON.stringify(body.config);
    }
    if (body.trigger !== undefined) {
      updates.trigger = typeof body.trigger === 'string' ? body.trigger : JSON.stringify(body.trigger);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    await db
      .update(workflowsTable)
      .set(updates)
      .where(
        and(
          eq(workflowsTable.id, id),
          eq(workflowsTable.userId, auth.userId)
        )
      );

    await logAuditEvent({
      apiKeyId: auth.apiKey.id,
      userId: auth.userId,
      action: 'workflows.update',
      resource: id,
      requestMethod: 'PUT',
      requestPath: `/api/external/workflows/${id}`,
      responseStatus: '200',
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error, workflowId: id }, 'External API: Failed to update workflow');
    return NextResponse.json({ error: 'Failed to update workflow' }, { status: 500 });
  }
}

/**
 * DELETE /api/external/workflows/[id]
 * Delete a workflow
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!checkPermission(auth.permissions, 'workflows', 'delete')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const [existing] = await db
      .select({ id: workflowsTable.id })
      .from(workflowsTable)
      .where(
        and(
          eq(workflowsTable.id, id),
          eq(workflowsTable.userId, auth.userId)
        )
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    await db
      .delete(workflowsTable)
      .where(
        and(
          eq(workflowsTable.id, id),
          eq(workflowsTable.userId, auth.userId)
        )
      );

    await logAuditEvent({
      apiKeyId: auth.apiKey.id,
      userId: auth.userId,
      action: 'workflows.delete',
      resource: id,
      requestMethod: 'DELETE',
      requestPath: `/api/external/workflows/${id}`,
      responseStatus: '200',
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error, workflowId: id }, 'External API: Failed to delete workflow');
    return NextResponse.json({ error: 'Failed to delete workflow' }, { status: 500 });
  }
}
