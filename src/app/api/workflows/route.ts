import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { postgresDb } from '@/lib/db';
import { workflowsTablePostgres } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/workflows
 * List all workflows for the authenticated user
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!postgresDb) {
      throw new Error('Database not initialized');
    }

    const workflows = await postgresDb
      .select({
        id: workflowsTablePostgres.id,
        name: workflowsTablePostgres.name,
        description: workflowsTablePostgres.description,
        status: workflowsTablePostgres.status,
        trigger: workflowsTablePostgres.trigger,
        config: workflowsTablePostgres.config,
        createdAt: workflowsTablePostgres.createdAt,
        lastRun: workflowsTablePostgres.lastRun,
        lastRunStatus: workflowsTablePostgres.lastRunStatus,
        runCount: workflowsTablePostgres.runCount,
      })
      .from(workflowsTablePostgres)
      .where(eq(workflowsTablePostgres.userId, session.user.id))
      .orderBy(workflowsTablePostgres.createdAt);

    return NextResponse.json({ workflows });
  } catch (error) {
    // Log the full error with stack trace
    console.error('❌ Failed to list workflows:', error);
    logger.error({ error: error instanceof Error ? { message: error.message, stack: error.stack } : error }, 'Failed to list workflows');
    return NextResponse.json(
      { error: 'Failed to list workflows' },
      { status: 500 }
    );
  }
}
