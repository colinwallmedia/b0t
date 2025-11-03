import { NextRequest, NextResponse } from 'next/server';
import { postgresDb } from '@/lib/db';
import { workflowsTablePostgres, organizationsTablePostgres } from '@/lib/schema';
import { importWorkflow } from '@/lib/workflows/import-export';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * POST /api/workflows/import-test
 * Import a workflow without authentication (local development only)
 *
 * This endpoint is for automated workflow creation by LLMs.
 * SECURITY: Only available in development mode, not in production.
 */
export async function POST(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Test endpoint not available in production' },
      { status: 403 }
    );
  }

  try {
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

    // Create test organization if it doesn't exist
    const testOrgId = 'test-org-1';
    const existingOrg = await postgresDb
      .select()
      .from(organizationsTablePostgres)
      .where(eq(organizationsTablePostgres.id, testOrgId))
      .limit(1);

    if (existingOrg.length === 0) {
      await postgresDb.insert(organizationsTablePostgres).values({
        id: testOrgId,
        name: 'Test Organization',
        slug: 'test-org',
        ownerId: '1', // Test user owns the test organization
      });
    }

    // Create workflow in database (use test user ID '1')
    const id = randomUUID();

    await postgresDb.insert(workflowsTablePostgres).values({
      id,
      userId: '1', // Test user
      organizationId: testOrgId,
      name: workflow.name,
      description: workflow.description,
      prompt: `Imported by LLM: ${workflow.name}`,
      config: JSON.stringify(workflow.config),
      trigger: JSON.stringify({ type: 'manual', config: {} }),
      status: 'draft',
    });

    logger.info(
      {
        userId: '1',
        workflowId: id,
        workflowName: workflow.name,
        originalAuthor: workflow.metadata?.author,
      },
      'Workflow imported via test endpoint'
    );

    return NextResponse.json({
      id,
      name: workflow.name,
      requiredCredentials: workflow.metadata?.requiresCredentials || [],
    }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Failed to import workflow via test endpoint');
    return NextResponse.json(
      { error: 'Failed to import workflow' },
      { status: 500 }
    );
  }
}
