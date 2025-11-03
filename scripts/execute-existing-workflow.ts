#!/usr/bin/env node
/**
 * Execute an existing workflow by ID
 */

import { executeWorkflow } from '@/lib/workflows/executor';
import { logger } from '@/lib/logger';

const workflowId = process.argv[2];
const userId = process.argv[3] || '1'; // Default to test user

if (!workflowId) {
  console.error('Usage: npx tsx scripts/execute-existing-workflow.ts <workflow-id> [user-id]');
  process.exit(1);
}

async function main() {
  try {
    console.log(`\n🚀 Executing workflow ${workflowId}...\n`);

    const startTime = Date.now();
    const result = await executeWorkflow(workflowId, userId, 'manual');
    const duration = Date.now() - startTime;

    if (result.success) {
      console.log('✅ Workflow executed successfully!');
      console.log(`⏱️  Duration: ${duration}ms`);
      console.log(`📊 Output:`, JSON.stringify(result.output, null, 2));
    } else {
      console.error('❌ Workflow execution failed!');
      console.error(`📋 Error: ${result.error}`);
      if (result.errorStep) {
        console.error(`🔴 Failed at step: ${result.errorStep}`);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Execution error:', error);
    process.exit(1);
  }
}

main();
