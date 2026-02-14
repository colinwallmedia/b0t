import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, checkPermission } from '@/lib/api-key-auth';
import { logAuditEvent } from '@/lib/audit';
import { db } from '@/lib/db';
import { workflowsTable } from '@/lib/schema';
import { eq, isNull, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';

/**
 * GET /api/external/workflows
 * List all workflows for the authenticated API key owner
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
    const workflows = await db
      .select({
        id: workflowsTable.id,
        name: workflowsTable.name,
        description: workflowsTable.description,
        status: workflowsTable.status,
        trigger: workflowsTable.trigger,
        createdAt: workflowsTable.createdAt,
        lastRun: workflowsTable.lastRun,
        lastRunStatus: workflowsTable.lastRunStatus,
        runCount: workflowsTable.runCount,
      })
      .from(workflowsTable)
      .where(isNull(workflowsTable.organizationId))
      .orderBy(desc(workflowsTable.createdAt))
      .limit(100);

    const parsed = workflows.map((w) => ({
      ...w,
      trigger: typeof w.trigger === 'string' ? JSON.parse(w.trigger) : w.trigger,
    }));

    await logAuditEvent({
      apiKeyId: auth.apiKey.id,
      userId: auth.userId,
      action: 'workflows.list',
      requestMethod: 'GET',
      requestPath: '/api/external/workflows',
      responseStatus: '200',
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
    });

    return NextResponse.json({ workflows: parsed });
  } catch (error) {
    logger.error({ error }, 'External API: Failed to list workflows');
    return NextResponse.json({ error: 'Failed to list workflows' }, { status: 500 });
  }
}

/**
 * POST /api/external/workflows
 * Create a new workflow
 */
export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!checkPermission(auth.permissions, 'workflows', 'create')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  try {
    const body = await request.json();

    const { name, description, trigger, config, prompt } = body;

    if (!name || !trigger || !config) {
      return NextResponse.json(
        { error: 'Validation failed', details: 'name, trigger, and config are required' },
        { status: 400 }
      );
    }

    const id = nanoid();

    await db.insert(workflowsTable).values({
      id,
      userId: auth.userId,
      name,
      description: description ?? null,
      prompt: prompt ?? name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: (typeof config === 'string' ? config : JSON.stringify(config)) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      trigger: (typeof trigger === 'string' ? trigger : JSON.stringify(trigger)) as any,
      status: 'active',
    });

    const [workflow] = await db
      .select()
      .from(workflowsTable)
      .where(eq(workflowsTable.id, id))
      .limit(1);

    await logAuditEvent({
      apiKeyId: auth.apiKey.id,
      userId: auth.userId,
      action: 'workflows.create',
      resource: id,
      requestMethod: 'POST',
      requestPath: '/api/external/workflows',
      responseStatus: '201',
      metadata: { workflowName: name },
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
    });

    return NextResponse.json({ workflow }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'External API: Failed to create workflow');
    return NextResponse.json({ error: 'Failed to create workflow' }, { status: 500 });
  }
}
