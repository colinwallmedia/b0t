import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { postgresDb } from '@/lib/db';
import { workflowsTablePostgres } from '@/lib/schema';
import { importWorkflow } from '@/lib/workflows/import-export';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * POST /api/workflows/import
 * Import a workflow from JSON
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workflowJson } = body;

    if (!workflowJson) {
      return NextResponse.json(
        { error: 'Missing required field: workflowJson' },
        { status: 400 }
      );
    }

    // Parse and validate workflow
    let workflow;
    try {
      workflow = importWorkflow(workflowJson);
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Invalid workflow format',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 400 }
      );
    }

    if (!postgresDb) {
      throw new Error('Database not initialized');
    }

    // Create workflow in database
    const id = randomUUID();

    await postgresDb.insert(workflowsTablePostgres).values({
      id,
      userId: session.user.id,
      organizationId: null,
      name: workflow.name,
      description: workflow.description,
      prompt: `Imported workflow: ${workflow.name}`,
      config: JSON.stringify(workflow.config),
      trigger: JSON.stringify({ type: 'manual', config: {} }),
      status: 'draft', // Imported workflows start as draft
    });

    logger.info(
      {
        userId: session.user.id,
        workflowId: id,
        workflowName: workflow.name,
        originalAuthor: workflow.metadata?.author,
      },
      'Workflow imported'
    );

    return NextResponse.json({
      id,
      name: workflow.name,
      requiredCredentials: workflow.metadata?.requiresCredentials || [],
    }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Failed to import workflow');
    return NextResponse.json(
      { error: 'Failed to import workflow' },
      { status: 500 }
    );
  }
}
