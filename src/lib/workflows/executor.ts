import { useSQLite, sqliteDb, postgresDb } from '@/lib/db';
import {
  workflowsTableSQLite,
  workflowRunsTableSQLite,
  workflowsTablePostgres,
  workflowRunsTablePostgres
} from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { randomUUID } from 'crypto';
import { executeStep, normalizeStep, type WorkflowStep } from './control-flow';

/**
 * Workflow Executor
 *
 * Executes LLM-generated workflow configurations by running steps sequentially
 * and passing data between steps via variable interpolation.
 */

export interface ExecutionContext {
  variables: Record<string, unknown>;
  workflowId: string;
  runId: string;
  userId: string;
}

/**
 * Execute a workflow by ID
 */
export async function executeWorkflow(
  workflowId: string,
  userId: string,
  triggerType: string,
  triggerData?: Record<string, unknown>
): Promise<{ success: boolean; output?: unknown; error?: string; errorStep?: string }> {
  logger.info({ workflowId, userId, triggerType }, 'Starting workflow execution');

  const runId = randomUUID();
  const startedAt = new Date();

  try {
    // Get workflow configuration first (need organizationId for PostgreSQL workflow run)
    let workflow;
    if (useSQLite) {
      if (!sqliteDb) throw new Error('SQLite database not initialized');
      const workflows = await sqliteDb
        .select()
        .from(workflowsTableSQLite)
        .where(eq(workflowsTableSQLite.id, workflowId))
        .limit(1);

      if (workflows.length === 0) {
        throw new Error(`Workflow ${workflowId} not found`);
      }
      workflow = workflows[0];
    } else {
      if (!postgresDb) throw new Error('PostgreSQL database not initialized');
      const workflows = await postgresDb
        .select()
        .from(workflowsTablePostgres)
        .where(eq(workflowsTablePostgres.id, workflowId))
        .limit(1);

      if (workflows.length === 0) {
        throw new Error(`Workflow ${workflowId} not found`);
      }
      workflow = workflows[0];
    }

    // Create workflow run record (after getting workflow for organizationId)
    if (useSQLite) {
      if (!sqliteDb) throw new Error('SQLite database not initialized');
      await sqliteDb.insert(workflowRunsTableSQLite).values({
        id: runId,
        workflowId,
        userId,
        status: 'running',
        triggerType,
        triggerData: triggerData ? JSON.stringify(triggerData) : null,
        startedAt,
      });
    } else {
      if (!postgresDb) throw new Error('PostgreSQL database not initialized');
      await postgresDb.insert(workflowRunsTablePostgres).values({
        id: runId,
        workflowId,
        userId,
        organizationId: workflow.organizationId || null,
        status: 'running',
        triggerType,
        triggerData: triggerData ? JSON.stringify(triggerData) : null,
        startedAt,
      });
    }

    // Parse config - for PostgreSQL it's a string, for SQLite it's already an object
    const config = (typeof workflow.config === 'string'
      ? JSON.parse(workflow.config)
      : workflow.config) as {
      steps: Array<{
        id: string;
        module: string;
        inputs: Record<string, unknown>;
        outputAs?: string;
      }>;
    };

    logger.info({ workflowId, stepCount: config.steps.length }, 'Executing workflow steps');

    // Load user credentials
    const userCredentials = await loadUserCredentials(userId);

    // Initialize execution context
    const context: ExecutionContext = {
      variables: {
        user: {
          id: userId,
          ...userCredentials, // e.g., { openai: "sk-...", stripe: "sk_test_..." }
        },
        trigger: triggerData || {},
      },
      workflowId,
      runId,
      userId,
    };

    let lastOutput: unknown = null;

    // Execute steps sequentially (with control flow support)
    for (const step of config.steps) {
      const normalizedStep = normalizeStep(step) as WorkflowStep;
      logger.info({ workflowId, runId, stepId: normalizedStep.id }, 'Executing step');

      try {
        // Execute step (supports actions, conditions, loops)
        lastOutput = await executeStep(
          normalizedStep,
          context,
          executeModuleFunction,
          resolveVariables
        );
      } catch (error) {
        logger.error({ error, workflowId, runId, stepId: normalizedStep.id }, 'Step execution failed');

        // Update workflow run with error
        const completedAt = new Date();
        if (useSQLite && sqliteDb) {
          await sqliteDb
            .update(workflowRunsTableSQLite)
            .set({
              status: 'error',
              completedAt,
              duration: completedAt.getTime() - startedAt.getTime(),
              error: error instanceof Error ? error.message : 'Unknown error',
              errorStep: step.id,
            })
            .where(eq(workflowRunsTableSQLite.id, runId));

          // Update workflow last run status
          await sqliteDb
            .update(workflowsTableSQLite)
            .set({
              lastRun: completedAt,
              lastRunStatus: 'error',
              lastRunError: error instanceof Error ? error.message : 'Unknown error',
              runCount: workflow.runCount + 1,
            })
            .where(eq(workflowsTableSQLite.id, workflowId));
        } else if (postgresDb) {
          await postgresDb
            .update(workflowRunsTablePostgres)
            .set({
              status: 'error',
              completedAt,
              duration: completedAt.getTime() - startedAt.getTime(),
              error: error instanceof Error ? error.message : 'Unknown error',
              errorStep: step.id,
            })
            .where(eq(workflowRunsTablePostgres.id, runId));

          // Update workflow last run status
          await postgresDb
            .update(workflowsTablePostgres)
            .set({
              lastRun: completedAt,
              lastRunStatus: 'error',
              lastRunError: error instanceof Error ? error.message : 'Unknown error',
              runCount: workflow.runCount + 1,
            })
            .where(eq(workflowsTablePostgres.id, workflowId));
        }

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          errorStep: normalizedStep.id,
        };
      }
    }

    // Update workflow run with success
    const completedAt = new Date();
    if (useSQLite && sqliteDb) {
      await sqliteDb
        .update(workflowRunsTableSQLite)
        .set({
          status: 'success',
          completedAt,
          duration: completedAt.getTime() - startedAt.getTime(),
          output: lastOutput ? JSON.stringify(lastOutput) : null,
        })
        .where(eq(workflowRunsTableSQLite.id, runId));

      // Update workflow last run status
      await sqliteDb
        .update(workflowsTableSQLite)
        .set({
          lastRun: completedAt,
          lastRunStatus: 'success',
          lastRunError: null,
          runCount: workflow.runCount + 1,
        })
        .where(eq(workflowsTableSQLite.id, workflowId));
    } else if (postgresDb) {
      await postgresDb
        .update(workflowRunsTablePostgres)
        .set({
          status: 'success',
          completedAt,
          duration: completedAt.getTime() - startedAt.getTime(),
          output: lastOutput ? JSON.stringify(lastOutput) : null,
        })
        .where(eq(workflowRunsTablePostgres.id, runId));

      // Update workflow last run status
      await postgresDb
        .update(workflowsTablePostgres)
        .set({
          lastRun: completedAt,
          lastRunStatus: 'success',
          lastRunError: null,
          runCount: workflow.runCount + 1,
        })
        .where(eq(workflowsTablePostgres.id, workflowId));
    }

    logger.info({ workflowId, runId, duration: completedAt.getTime() - startedAt.getTime() }, 'Workflow execution completed');

    return { success: true, output: lastOutput };
  } catch (error) {
    logger.error({ error, workflowId, userId }, 'Workflow execution failed');

    // Update workflow run with error if it exists
    try {
      const completedAt = new Date();
      if (useSQLite && sqliteDb) {
        await sqliteDb
          .update(workflowRunsTableSQLite)
          .set({
            status: 'error',
            completedAt,
            duration: completedAt.getTime() - startedAt.getTime(),
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          .where(eq(workflowRunsTableSQLite.id, runId));
      } else if (postgresDb) {
        await postgresDb
          .update(workflowRunsTablePostgres)
          .set({
            status: 'error',
            completedAt,
            duration: completedAt.getTime() - startedAt.getTime(),
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          .where(eq(workflowRunsTablePostgres.id, runId));
      }
    } catch (updateError) {
      logger.error({ updateError }, 'Failed to update workflow run status');
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Resolve variables in inputs
 * Replaces {{variableName}} with actual values from context
 */
function resolveVariables(
  inputs: Record<string, unknown>,
  variables: Record<string, unknown>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(inputs)) {
    resolved[key] = resolveValue(value, variables);
  }

  return resolved;
}

/**
 * Resolve a single value (recursive for nested objects/arrays)
 */
function resolveValue(value: unknown, variables: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    // Match {{variable}} or {{variable.property}} or {{variable[0].property}}
    const match = value.match(/^{{(.+)}}$/);
    if (match) {
      const path = match[1];
      return getNestedValue(variables, path);
    }

    // Replace inline variables in strings
    return value.replace(/{{(.+?)}}/g, (_, path) => {
      const resolved = getNestedValue(variables, path);
      return String(resolved ?? '');
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, variables));
  }

  if (value && typeof value === 'object') {
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      resolved[k] = resolveValue(v, variables);
    }
    return resolved;
  }

  return value;
}

/**
 * Get nested value from object using dot notation
 * Supports: variable.property, variable[0], variable[0].property
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split(/\.|\[|\]/).filter(Boolean);
  let current: unknown = obj;

  for (const key of keys) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Execute a module function dynamically
 * Module path format: category.module.function
 * Example: utilities.rss.parseFeed → src/modules/utilities/rss.ts → parseFeed()
 */
async function executeModuleFunction(
  modulePath: string,
  inputs: Record<string, unknown>
): Promise<unknown> {
  logger.info({ modulePath, inputs }, 'Executing module function');

  const [category, moduleName, functionName] = modulePath.split('.');

  if (!category || !moduleName || !functionName) {
    throw new Error(`Invalid module path: ${modulePath}`);
  }

  try {
    // Dynamic import of module
    const moduleFile = await import(`@/modules/${category}/${moduleName}`);

    if (!moduleFile[functionName]) {
      throw new Error(`Function ${functionName} not found in module ${category}/${moduleName}`);
    }

    const func = moduleFile[functionName];

    // Call the function with inputs
    // Pass parameters as positional arguments based on the inputs object
    const inputKeys = Object.keys(inputs);

    if (inputKeys.length === 0) {
      // No parameters
      return await func();
    } else if (inputKeys.length === 1) {
      // Single parameter - pass the value directly
      return await func(Object.values(inputs)[0]);
    } else {
      // Multiple parameters - try both approaches
      // First, try passing as single object (most common for workflow functions)
      try {
        return await func(inputs);
      } catch (firstError) {
        // If that fails, try passing values in order (for functions like addDays(date, days))
        const values = Object.values(inputs);
        try {
          return await func(...values);
        } catch {
          // Throw the first error as it's more likely to be relevant
          throw firstError;
        }
      }
    }
  } catch (error) {
    logger.error({ error, modulePath }, 'Module function execution failed');
    throw new Error(
      `Failed to execute ${modulePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Load all credentials for a user from both OAuth accounts and API keys
 * Returns an object like: { twitter: "token...", youtube: "token...", openai: "sk-...", ... }
 */
async function loadUserCredentials(userId: string): Promise<Record<string, string>> {
  try {
    const credentialMap: Record<string, string> = {};

    if (useSQLite) {
      if (!sqliteDb) throw new Error('SQLite database not initialized');

      // 1. Load OAuth tokens from accounts table (Twitter, YouTube, etc.)
      const { accountsTableSQLite, userCredentialsTableSQLite } = await import('@/lib/schema');
      const accounts = await sqliteDb
        .select()
        .from(accountsTableSQLite)
        .where(eq(accountsTableSQLite.userId, userId));

      for (const account of accounts) {
        if (account.access_token) {
          const { decrypt } = await import('@/lib/encryption');
          const decryptedToken = await decrypt(account.access_token);
          credentialMap[account.provider] = decryptedToken;
        }
      }

      // 2. Load API keys from user_credentials table (OpenAI, RapidAPI, Stripe, etc.)
      const credentials = await sqliteDb
        .select()
        .from(userCredentialsTableSQLite)
        .where(eq(userCredentialsTableSQLite.userId, userId));

      for (const cred of credentials) {
        if (cred.encryptedValue) {
          const { decrypt } = await import('@/lib/encryption');
          const decryptedValue = await decrypt(cred.encryptedValue);
          credentialMap[cred.platform] = decryptedValue;
        }
      }
    } else {
      if (!postgresDb) throw new Error('PostgreSQL database not initialized');

      // 1. Load OAuth tokens
      const { accountsTablePostgres } = await import('@/lib/schema');
      const accounts = await postgresDb
        .select()
        .from(accountsTablePostgres)
        .where(eq(accountsTablePostgres.userId, userId));

      for (const account of accounts) {
        if (account.access_token) {
          const { decrypt } = await import('@/lib/encryption');
          const decryptedToken = await decrypt(account.access_token);
          credentialMap[account.provider] = decryptedToken;
        }
      }

      // 2. Load API keys (TODO: Implement PostgreSQL user_credentials table)
      // For now, PostgreSQL only supports OAuth credentials from accounts table
    }

    logger.info(
      {
        userId,
        credentialCount: Object.keys(credentialMap).length,
        platforms: Object.keys(credentialMap),
      },
      'User credentials loaded (OAuth + API keys)'
    );

    return credentialMap;
  } catch (error) {
    logger.error({ error, userId }, 'Failed to load user credentials');
    return {}; // Return empty object if loading fails
  }
}

/**
 * Execute workflow from config directly (without database lookup)
 */
export async function executeWorkflowConfig(
  config: {
    steps: Array<{
      id: string;
      module: string;
      inputs: Record<string, unknown>;
      outputAs?: string;
    }>;
  },
  userId: string,
  triggerData?: Record<string, unknown>
): Promise<{ success: boolean; output?: unknown; error?: string; errorStep?: string }> {
  const runId = randomUUID();
  logger.info({ runId, stepCount: config.steps.length }, 'Executing workflow config');

  // Load user credentials
  const userCredentials = await loadUserCredentials(userId);

  const context: ExecutionContext = {
    variables: {
      user: {
        id: userId,
        ...userCredentials,
      },
      trigger: triggerData || {},
    },
    workflowId: 'inline',
    runId,
    userId,
  };

  let lastOutput: unknown = null;

  try {
    for (const step of config.steps) {
      const normalizedStep = normalizeStep(step) as WorkflowStep;
      logger.info({ runId, stepId: normalizedStep.id }, 'Executing step');

      lastOutput = await executeStep(
        normalizedStep,
        context,
        executeModuleFunction,
        resolveVariables
      );
    }

    logger.info({ runId }, 'Workflow config execution completed');
    return { success: true, output: lastOutput };
  } catch (error) {
    logger.error({ error, runId }, 'Workflow config execution failed');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
