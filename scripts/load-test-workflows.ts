/**
 * Load Testing Script for Workflow Execution
 *
 * This script simulates concurrent workflow executions to verify:
 * 1. How many workflows can run concurrently
 * 2. Database pool utilization under load
 * 3. Queue processing performance
 * 4. Actual throughput vs theoretical
 *
 * Usage:
 *   tsx scripts/load-test-workflows.ts --concurrent 50 --total 500
 */

import { queueWorkflowExecution, getWorkflowQueueStats } from '../src/lib/workflows/workflow-queue';
import { executeWorkflowConfig } from '../src/lib/workflows/executor';
import { pool } from '../src/lib/db';

// Parse command line arguments
const args = process.argv.slice(2);
const concurrentArg = args.findIndex(arg => arg === '--concurrent');
const totalArg = args.findIndex(arg => arg === '--total');
const useQueueArg = args.includes('--use-queue');

const CONCURRENT_WORKFLOWS = concurrentArg >= 0 ? parseInt(args[concurrentArg + 1], 10) : 20;
const TOTAL_WORKFLOWS = totalArg >= 0 ? parseInt(args[totalArg + 1], 10) : 100;
const USE_QUEUE = useQueueArg;

// Test user ID
const TEST_USER_ID = 'load-test-user';

// Simple test workflow (I/O-bound)
const testWorkflow = {
  steps: [
    {
      id: 'step1',
      module: 'utilities.datetime.now',
      inputs: {},
      outputAs: 'now',
    },
    {
      id: 'step2',
      module: 'utilities.datetime.addDays',
      inputs: { days: 5 },
      outputAs: 'future',
    },
    {
      id: 'step3',
      module: 'utilities.datetime.formatDate',
      inputs: {
        date: '{{future}}',
        format: 'YYYY-MM-DD',
      },
      outputAs: 'formatted',
    },
  ],
};

interface TestResults {
  totalWorkflows: number;
  concurrent: number;
  successful: number;
  failed: number;
  totalDuration: number;
  avgDuration: number;
  throughput: number;
  peakDbConnections: number;
  peakActiveWorkflows: number;
  errors: string[];
}

/**
 * Monitor system resources during test
 */
class ResourceMonitor {
  private peakDbConnections = 0;
  private peakActiveWorkflows = 0;
  private monitoring = true;
  private monitoringInterval: NodeJS.Timeout | null = null;

  start() {
    this.monitoring = true;
    this.monitoringInterval = setInterval(async () => {
      if (!this.monitoring) return;

      // Monitor database pool
      const dbConnections = pool.totalCount;
      if (dbConnections > this.peakDbConnections) {
        this.peakDbConnections = dbConnections;
      }

      // Monitor queue if using it
      if (USE_QUEUE) {
        try {
          const stats = await getWorkflowQueueStats();
          if (stats && stats.active > this.peakActiveWorkflows) {
            this.peakActiveWorkflows = stats.active;
          }

          console.log(
            `[Monitor] DB: ${dbConnections} connections, ` +
            `Queue: ${stats?.active || 0} active, ${stats?.waiting || 0} waiting`
          );
        } catch {
          // Queue might not be initialized
        }
      } else {
        console.log(`[Monitor] DB: ${dbConnections} connections`);
      }
    }, 1000);
  }

  stop() {
    this.monitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }

  getStats() {
    return {
      peakDbConnections: this.peakDbConnections,
      peakActiveWorkflows: this.peakActiveWorkflows,
    };
  }
}

/**
 * Execute a single workflow (direct execution, no queue)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function executeWorkflowDirect(_workflowId: number): Promise<{ success: boolean; duration: number; error?: string }> {
  const startTime = Date.now();

  try {
    const result = await executeWorkflowConfig(testWorkflow, TEST_USER_ID);
    const duration = Date.now() - startTime;

    return {
      success: result.success,
      duration,
      error: result.error,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      duration,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Execute workflows via queue
 */
async function executeWorkflowQueued(workflowId: number): Promise<{ success: boolean; duration: number; error?: string }> {
  const startTime = Date.now();

  try {
    await queueWorkflowExecution(
      `load-test-${workflowId}`,
      TEST_USER_ID,
      'manual',
      { loadTest: true }
    );
    const duration = Date.now() - startTime;

    return {
      success: true,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      duration,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run load test
 */
async function runLoadTest(): Promise<TestResults> {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  Workflow Load Testing                 ║');
  console.log('╚════════════════════════════════════════╝\n');

  console.log(`Total Workflows: ${TOTAL_WORKFLOWS}`);
  console.log(`Concurrent: ${CONCURRENT_WORKFLOWS}`);
  console.log(`Execution Mode: ${USE_QUEUE ? 'Queue (BullMQ)' : 'Direct'}`);
  console.log(`Database Pool Max: ${process.env.DB_POOL_MAX || '20'}`);
  console.log(`Workflow Concurrency: ${process.env.WORKFLOW_CONCURRENCY || '20'}`);
  console.log('');

  const monitor = new ResourceMonitor();
  monitor.start();

  const results: TestResults = {
    totalWorkflows: TOTAL_WORKFLOWS,
    concurrent: CONCURRENT_WORKFLOWS,
    successful: 0,
    failed: 0,
    totalDuration: 0,
    avgDuration: 0,
    throughput: 0,
    peakDbConnections: 0,
    peakActiveWorkflows: 0,
    errors: [],
  };

  const executeFunction = USE_QUEUE ? executeWorkflowQueued : executeWorkflowDirect;

  const overallStartTime = Date.now();

  // Execute workflows in batches of CONCURRENT_WORKFLOWS
  for (let i = 0; i < TOTAL_WORKFLOWS; i += CONCURRENT_WORKFLOWS) {
    const batchSize = Math.min(CONCURRENT_WORKFLOWS, TOTAL_WORKFLOWS - i);
    const batchNumber = Math.floor(i / CONCURRENT_WORKFLOWS) + 1;
    const totalBatches = Math.ceil(TOTAL_WORKFLOWS / CONCURRENT_WORKFLOWS);

    console.log(`\n[Batch ${batchNumber}/${totalBatches}] Starting ${batchSize} workflows...`);

    const batchStartTime = Date.now();

    // Execute batch concurrently
    const promises = Array.from({ length: batchSize }, (_, j) =>
      executeFunction(i + j + 1)
    );

    const batchResults = await Promise.allSettled(promises);

    const batchDuration = Date.now() - batchStartTime;

    // Process results
    batchResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          results.successful++;
        } else {
          results.failed++;
          if (result.value.error) {
            results.errors.push(result.value.error);
          }
        }
        results.totalDuration += result.value.duration;
      } else {
        results.failed++;
        results.errors.push(result.reason?.message || 'Unknown error');
      }
    });

    console.log(
      `[Batch ${batchNumber}/${totalBatches}] Completed in ${batchDuration}ms ` +
      `(${results.successful}/${results.totalWorkflows} successful so far)`
    );
  }

  const overallDuration = Date.now() - overallStartTime;

  monitor.stop();
  const monitorStats = monitor.getStats();

  results.peakDbConnections = monitorStats.peakDbConnections;
  results.peakActiveWorkflows = monitorStats.peakActiveWorkflows;
  results.avgDuration = results.totalDuration / TOTAL_WORKFLOWS;
  results.throughput = (TOTAL_WORKFLOWS / overallDuration) * 1000 * 60; // per minute

  return results;
}

/**
 * Print results
 */
function printResults(results: TestResults) {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  Load Test Results                     ║');
  console.log('╚════════════════════════════════════════╝\n');

  console.log(`Total Workflows: ${results.totalWorkflows}`);
  console.log(`Concurrent: ${results.concurrent}`);
  console.log(`Successful: ${results.successful} (${((results.successful / results.totalWorkflows) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${results.failed} (${((results.failed / results.totalWorkflows) * 100).toFixed(1)}%)`);
  console.log('');
  console.log(`Average Duration: ${results.avgDuration.toFixed(0)}ms per workflow`);
  console.log(`Throughput: ${results.throughput.toFixed(0)} workflows/minute`);
  console.log('');
  console.log(`Peak DB Connections: ${results.peakDbConnections} / ${process.env.DB_POOL_MAX || '20'}`);
  console.log(`Peak Active Workflows: ${results.peakActiveWorkflows}`);
  console.log('');

  if (results.errors.length > 0) {
    console.log('Errors:');
    const uniqueErrors = [...new Set(results.errors)];
    uniqueErrors.slice(0, 5).forEach((error, i) => {
      console.log(`  ${i + 1}. ${error}`);
    });
    if (uniqueErrors.length > 5) {
      console.log(`  ... and ${uniqueErrors.length - 5} more unique errors`);
    }
  }

  console.log('');

  // Verdict
  const dbUtilization = (results.peakDbConnections / parseInt(process.env.DB_POOL_MAX || '20', 10)) * 100;

  console.log('╔════════════════════════════════════════╗');
  console.log('║  Analysis                              ║');
  console.log('╚════════════════════════════════════════╝\n');

  if (results.failed === 0) {
    console.log('✅ All workflows executed successfully!');
  } else {
    console.log(`⚠️  ${results.failed} workflows failed`);
  }

  if (dbUtilization > 90) {
    console.log(`⚠️  Database pool at ${dbUtilization.toFixed(0)}% capacity - consider increasing DB_POOL_MAX`);
  } else if (dbUtilization > 70) {
    console.log(`⚠️  Database pool at ${dbUtilization.toFixed(0)}% capacity - monitor closely`);
  } else {
    console.log(`✅ Database pool healthy (${dbUtilization.toFixed(0)}% utilization)`);
  }

  console.log('');
}

// Run the load test
runLoadTest()
  .then((results) => {
    printResults(results);
    process.exit(results.failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('❌ Load test failed:', error);
    process.exit(1);
  });
