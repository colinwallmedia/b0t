/**
 * Comprehensive Stress Test
 *
 * Tests the system under various loads to find:
 * 1. Maximum concurrent workflows before slowdown
 * 2. Database pool bottleneck point
 * 3. Throughput degradation curve
 * 4. Memory usage patterns
 *
 * Usage: npx tsx scripts/stress-test.ts
 */

import { executeWorkflowConfig } from '../src/lib/workflows/executor';
import { pool } from '../src/lib/db';

const TEST_USER_ID = 'stress-test-user';

// Simple workflow (3 steps, I/O-bound)
const testWorkflow = {
  steps: [
    { id: 's1', module: 'utilities.datetime.now', inputs: {}, outputAs: 'now' },
    { id: 's2', module: 'utilities.datetime.addDays', inputs: { days: 5 }, outputAs: 'future' },
    { id: 's3', module: 'utilities.datetime.addDays', inputs: { days: 10 }, outputAs: 'far_future' },
  ],
};

interface StressTestResult {
  testName: string;
  concurrent: number;
  total: number;
  successful: number;
  failed: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  throughput: number; // workflows/minute
  peakDbConnections: number;
  dbUtilization: number;
  totalTime: number;
  errors: string[];
}

/**
 * Execute workflows concurrently and measure performance
 */
async function runStressTest(
  concurrent: number,
  total: number
): Promise<StressTestResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${concurrent} concurrent, ${total} total workflows`);
  console.log('='.repeat(60));

  const results: number[] = [];
  const errors: string[] = [];
  let successful = 0;
  let failed = 0;
  let peakDbConnections = 0;

  // Monitor DB connections
  const monitorInterval = setInterval(() => {
    const current = pool.totalCount;
    if (current > peakDbConnections) {
      peakDbConnections = current;
    }
  }, 100);

  const overallStart = Date.now();

  // Execute in batches
  for (let i = 0; i < total; i += concurrent) {
    const batchSize = Math.min(concurrent, total - i);
    const batchNum = Math.floor(i / concurrent) + 1;
    const totalBatches = Math.ceil(total / concurrent);

    process.stdout.write(`  Batch ${batchNum}/${totalBatches} (${batchSize} workflows)... `);

    const promises = Array.from({ length: batchSize }, async () => {
      const start = Date.now();
      try {
        await executeWorkflowConfig(testWorkflow, TEST_USER_ID);
        const duration = Date.now() - start;
        results.push(duration);
        successful++;
        return { success: true, duration };
      } catch (error) {
        const duration = Date.now() - start;
        failed++;
        const errMsg = error instanceof Error ? error.message : String(error);
        if (!errors.includes(errMsg)) {
          errors.push(errMsg);
        }
        return { success: false, duration };
      }
    });

    await Promise.allSettled(promises);
    console.log(`✓ (${successful}/${total} done)`);
  }

  const totalTime = Date.now() - overallStart;
  clearInterval(monitorInterval);

  // Calculate statistics
  results.sort((a, b) => a - b);
  const avgDuration = results.reduce((a, b) => a + b, 0) / results.length;
  const minDuration = results[0] || 0;
  const maxDuration = results[results.length - 1] || 0;
  const p50Duration = results[Math.floor(results.length * 0.5)] || 0;
  const p95Duration = results[Math.floor(results.length * 0.95)] || 0;
  const p99Duration = results[Math.floor(results.length * 0.99)] || 0;
  const throughput = (total / totalTime) * 1000 * 60; // per minute

  const dbPoolMax = parseInt(process.env.DB_POOL_MAX || '20', 10);
  const dbUtilization = (peakDbConnections / dbPoolMax) * 100;

  return {
    testName: `${concurrent} concurrent`,
    concurrent,
    total,
    successful,
    failed,
    avgDuration,
    minDuration,
    maxDuration,
    p50Duration,
    p95Duration,
    p99Duration,
    throughput,
    peakDbConnections,
    dbUtilization,
    totalTime,
    errors: errors.slice(0, 3), // Top 3 unique errors
  };
}

/**
 * Print results table
 */
function printResults(results: StressTestResult[]) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('STRESS TEST RESULTS');
  console.log('='.repeat(60));

  console.log('\nPerformance Summary:');
  console.log('─'.repeat(100));
  console.log(
    'Test'.padEnd(20) +
    'Success'.padEnd(12) +
    'Avg (ms)'.padEnd(12) +
    'P95 (ms)'.padEnd(12) +
    'Throughput'.padEnd(15) +
    'DB Usage'
  );
  console.log('─'.repeat(100));

  results.forEach((r) => {
    const successRate = ((r.successful / r.total) * 100).toFixed(1);
    console.log(
      r.testName.padEnd(20) +
      `${r.successful}/${r.total} (${successRate}%)`.padEnd(12) +
      r.avgDuration.toFixed(0).padEnd(12) +
      r.p95Duration.toFixed(0).padEnd(12) +
      `${r.throughput.toFixed(0)}/min`.padEnd(15) +
      `${r.peakDbConnections}/${process.env.DB_POOL_MAX || '20'} (${r.dbUtilization.toFixed(0)}%)`
    );
  });

  console.log('\nDetailed Latency (milliseconds):');
  console.log('─'.repeat(100));
  console.log(
    'Test'.padEnd(20) +
    'Min'.padEnd(10) +
    'P50'.padEnd(10) +
    'Avg'.padEnd(10) +
    'P95'.padEnd(10) +
    'P99'.padEnd(10) +
    'Max'
  );
  console.log('─'.repeat(100));

  results.forEach((r) => {
    console.log(
      r.testName.padEnd(20) +
      r.minDuration.toFixed(0).padEnd(10) +
      r.p50Duration.toFixed(0).padEnd(10) +
      r.avgDuration.toFixed(0).padEnd(10) +
      r.p95Duration.toFixed(0).padEnd(10) +
      r.p99Duration.toFixed(0).padEnd(10) +
      r.maxDuration.toFixed(0)
    );
  });

  // Analysis
  console.log('\n' + '='.repeat(60));
  console.log('ANALYSIS');
  console.log('='.repeat(60));

  const allSuccess = results.every((r) => r.failed === 0);
  const bottleneck = results.find((r) => r.dbUtilization > 90);
  const slowdown = results.find((r, i) => {
    if (i === 0) return false;
    const prev = results[i - 1];
    return r.avgDuration > prev.avgDuration * 1.5; // 50% slowdown
  });

  if (allSuccess) {
    console.log('✅ All workflows succeeded across all tests');
  } else {
    console.log('⚠️  Some workflows failed:');
    results.forEach((r) => {
      if (r.failed > 0) {
        console.log(`   - ${r.testName}: ${r.failed} failures`);
        r.errors.forEach((err) => console.log(`     • ${err}`));
      }
    });
  }

  if (bottleneck) {
    console.log(
      `\n⚠️  Database pool bottleneck at ${bottleneck.concurrent} concurrent workflows`
    );
    console.log(`   Peak: ${bottleneck.peakDbConnections}/${process.env.DB_POOL_MAX || '20'} connections (${bottleneck.dbUtilization.toFixed(0)}%)`);
  } else {
    console.log('\n✅ No database pool bottleneck detected');
  }

  if (slowdown) {
    console.log(`\n⚠️  Performance degradation at ${slowdown.concurrent} concurrent workflows`);
    console.log(`   Avg latency: ${slowdown.avgDuration.toFixed(0)}ms (vs ${results[0].avgDuration.toFixed(0)}ms baseline)`);
  } else {
    console.log('✅ No significant performance degradation');
  }

  // Recommendations
  console.log('\nRecommendations:');
  const maxConcurrent = results[results.length - 1].concurrent;

  if (bottleneck && bottleneck.dbUtilization > 95) {
    console.log(`   📈 Increase DB_POOL_MAX beyond ${process.env.DB_POOL_MAX || '20'} for higher concurrency`);
  }

  if (allSuccess && !slowdown) {
    console.log(`   ✅ System handles ${maxConcurrent} concurrent workflows without issues`);
    console.log(`   💡 Can likely handle more - increase test limits to find true max`);
  }

  const avgThroughput = results.reduce((sum, r) => sum + r.throughput, 0) / results.length;
  console.log(`   📊 Average throughput: ${avgThroughput.toFixed(0)} workflows/minute`);

  console.log('');
}

/**
 * Run progressive stress tests
 */
async function runAllTests() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  B0T Workflow Execution Stress Test                  ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  console.log(`\nConfiguration:`);
  console.log(`  DB_POOL_MAX: ${process.env.DB_POOL_MAX || '20'}`);
  console.log(`  WORKFLOW_CONCURRENCY: ${process.env.WORKFLOW_CONCURRENCY || '20'}`);
  console.log(`  Test workflow: 3 steps (datetime operations, I/O-bound)`);

  const results: StressTestResult[] = [];

  // Progressive tests: 10, 20, 30, 40, 50 concurrent
  const tests = [
    { concurrent: 10, total: 50 },
    { concurrent: 20, total: 100 },
    { concurrent: 30, total: 150 },
    { concurrent: 40, total: 200 },
    { concurrent: 50, total: 250 },
  ];

  for (const test of tests) {
    try {
      const result = await runStressTest(test.concurrent, test.total);
      results.push(result);

      // Stop if we hit 100% DB pool usage or 50% failure rate
      if (result.dbUtilization >= 100 || result.failed > result.total * 0.5) {
        console.log(`\n⚠️  Stopping tests - system limit reached`);
        break;
      }
    } catch (error) {
      console.error(`\n❌ Test failed:`, error);
      break;
    }
  }

  printResults(results);

  process.exit(0);
}

// Run the tests
runAllTests().catch((error) => {
  console.error('❌ Stress test suite failed:', error);
  process.exit(1);
});
