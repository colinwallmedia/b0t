import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { workflowsTable } from '@/lib/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/workflows
 * List all workflows for the authenticated user
 * Query params:
 *   - organizationId: Filter by organization/client
 */
export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    // Build where clause
    const whereConditions = [eq(workflowsTable.userId, session.user.id)];

    if (organizationId) {
      // Filter by specific organization
      whereConditions.push(eq(workflowsTable.organizationId, organizationId));
    } else {
      // Show only admin's personal workflows (not tied to any organization)
      whereConditions.push(isNull(workflowsTable.organizationId));
    }

    const workflows = await db
      .select({
        id: workflowsTable.id,
        name: workflowsTable.name,
        description: workflowsTable.description,
        status: workflowsTable.status,
        trigger: workflowsTable.trigger,
        config: workflowsTable.config,
        createdAt: workflowsTable.createdAt,
        lastRun: workflowsTable.lastRun,
        lastRunStatus: workflowsTable.lastRunStatus,
        lastRunOutput: workflowsTable.lastRunOutput,
        runCount: workflowsTable.runCount,
      })
      .from(workflowsTable)
      .where(and(...whereConditions))
      .orderBy(workflowsTable.createdAt);

    return NextResponse.json({ workflows });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        action: 'workflows_list_failed'
      },
      'Failed to list workflows'
    );
    return NextResponse.json(
      { error: 'Failed to list workflows' },
      { status: 500 }
    );
  }
}
