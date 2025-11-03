import { NextRequest, NextResponse } from 'next/server';
import { postgresDb } from '@/lib/db';
import { workflowsTablePostgres, organizationsTablePostgres } from '@/lib/schema';
import { importWorkflow } from '@/lib/workflows/import-export';
import { executeWorkflow } from '@/lib/workflows/executor';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * POST /api/workflows/execute-test
 * Test a workflow without authentication (local development only)
 *
 * This endpoint is for automated testing and LLM-generated workflow validation.
 * It temporarily imports, executes, and then deletes the workflow.
 *
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
          success: false,
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
    const workflowId = randomUUID();

    await postgresDb.insert(workflowsTablePostgres).values({
      id: workflowId,
      userId: '1', // Test user
      organizationId: testOrgId,
      name: workflow.name,
      description: workflow.description,
      prompt: `Test workflow: ${workflow.name}`,
      config: JSON.stringify(workflow.config),
      trigger: JSON.stringify({ type: 'manual', config: {} }),
      status: 'draft',
    });

    logger.info(
      {
        workflowId,
        workflowName: workflow.name,
      },
      'Test workflow created'
    );

    // Execute the workflow
    const startTime = Date.now();
    const result = await executeWorkflow(workflowId, '1', 'manual');
    const duration = Date.now() - startTime;

    // Clean up - delete the test workflow
    await postgresDb
      .delete(workflowsTablePostgres)
      .where(eq(workflowsTablePostgres.id, workflowId));

    logger.info(
      {
        workflowId,
        success: result.success,
        duration,
      },
      'Test workflow executed and cleaned up'
    );

    // Return execution result
    return NextResponse.json({
      id: workflowId,
      name: workflow.name,
      success: result.success,
      output: result.output,
      error: result.error,
      errorStep: result.errorStep,
      duration,
      requiredCredentials: workflow.metadata?.requiresCredentials || [],
    }, { status: 200 }); // Always 200, check success field
  } catch (error) {
    logger.error({ error }, 'Failed to test workflow');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to test workflow',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
