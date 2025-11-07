import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';
import { workflowsTable, workflowRunsTable } from '@/lib/schema';
import { eq, count, and, isNull } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    // Build where conditions
    const runsWhereSuccess = organizationId
      ? and(eq(workflowRunsTable.status, 'success'), eq(workflowRunsTable.organizationId, organizationId))
      : and(eq(workflowRunsTable.status, 'success'), isNull(workflowRunsTable.organizationId));

    const runsWhereError = organizationId
      ? and(eq(workflowRunsTable.status, 'error'), eq(workflowRunsTable.organizationId, organizationId))
      : and(eq(workflowRunsTable.status, 'error'), isNull(workflowRunsTable.organizationId));

    const workflowsWhereActive = organizationId
      ? and(eq(workflowsTable.status, 'active'), eq(workflowsTable.organizationId, organizationId))
      : and(eq(workflowsTable.status, 'active'), isNull(workflowsTable.organizationId));

    // Fetch all stats in parallel for better performance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbAny = db as any;
    const [
      successfulRuns,
      failedRuns,
      activeWorkflows,
    ] = await Promise.all([
      // Count successful workflow executions
      dbAny.select({ count: count() })
        .from(workflowRunsTable)
        .where(runsWhereSuccess) as Promise<Array<{ count: number }>>,

      // Count failed workflow executions
      dbAny.select({ count: count() })
        .from(workflowRunsTable)
        .where(runsWhereError) as Promise<Array<{ count: number }>>,

      // Count active workflows (not draft or paused)
      dbAny.select({ count: count() })
        .from(workflowsTable)
        .where(workflowsWhereActive) as Promise<Array<{ count: number }>>,
    ]);

    const successCount = successfulRuns[0]?.count || 0;
    const failCount = failedRuns[0]?.count || 0;
    const activeJobsCount = activeWorkflows[0]?.count || 0;
    const totalExecutions = successCount + failCount;

    return NextResponse.json({
      automations: {
        successfulRuns: successCount,
        failedRuns: failCount,
        activeJobs: activeJobsCount,
        totalExecutions,
      },
      system: {
        database: 'PostgreSQL',
      },
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        action: 'dashboard_stats_fetch_failed'
      },
      'Error fetching dashboard stats'
    );
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
