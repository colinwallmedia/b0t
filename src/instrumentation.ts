/**
 * Next.js Instrumentation File
 *
 * This file is used to run code when the server starts.
 * Perfect for initializing scheduled jobs.
 *
 * Automatically chooses between:
 * - BullMQ (persistent jobs) if REDIS_URL is set
 * - node-cron (simple scheduler) if Redis is not available
 *
 * Note: Next.js automatically loads .env files, no need for manual dotenv loading
 */

export async function register() {
  // Only run in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeScheduler } = await import('./lib/jobs');
    const { logger } = await import('./lib/logger');

    // Check production environment setup
    const isProduction = process.env.NODE_ENV === 'production';
    const isRailway = process.env.RAILWAY_ENVIRONMENT !== undefined;

    if (isProduction && isRailway) {
      logger.info('🚂 Railway deployment detected - validating configuration');

      const warnings: string[] = [];

      // Check for PostgreSQL
      if (!process.env.DATABASE_URL) {
        warnings.push('⚠️  WARNING: DATABASE_URL not set - using SQLite (data will be lost on redeploy!)');
        warnings.push('   → Add PostgreSQL: Railway Dashboard → New → Database → Add PostgreSQL');
      } else {
        logger.info('✅ PostgreSQL connected');
      }

      // Check for Redis
      if (!process.env.REDIS_URL) {
        warnings.push('⚠️  WARNING: REDIS_URL not set - jobs will be lost on restart!');
        warnings.push('   → Add Redis: Railway Dashboard → New → Database → Add Redis');
      } else {
        logger.info('✅ Redis URL configured');
        // Test Redis connection
        try {
          const { Redis } = await import('ioredis');
          const testRedis = new Redis(process.env.REDIS_URL, {
            maxRetriesPerRequest: 1,
            connectTimeout: 5000,
            lazyConnect: true,
          });
          await testRedis.connect();
          await testRedis.ping();
          logger.info('✅ Redis connection verified');
          await testRedis.quit();
        } catch (error) {
          logger.error({ error }, '❌ Redis connection failed - check REDIS_URL is correct');
          warnings.push('⚠️  Redis connection failed - verify REDIS_URL is correct');
        }
      }

      // Log all warnings
      if (warnings.length > 0) {
        logger.warn('\n' + warnings.join('\n'));
        logger.warn('📖 See DEPLOYMENT.md for setup instructions');
      } else {
        logger.info('✅ All production services configured correctly');
      }
    }

    // Initialize scheduler in background to avoid blocking
    initializeScheduler().catch(error => {
      logger.error({ error }, 'Failed to initialize scheduler');
    });

    // Initialize workflow queue and scheduler
    const { initializeWorkflowQueue } = await import('./lib/workflows/workflow-queue');
    const { workflowScheduler } = await import('./lib/workflows/workflow-scheduler');

    // Initialize workflow queue (10 concurrent workflows by default)
    // Note: Queue initialization runs in background, don't await the worker
    initializeWorkflowQueue({
      concurrency: 10,  // Run up to 10 workflows simultaneously
      maxJobsPerMinute: 100,  // Rate limit: max 100 workflow executions per minute
    }).then(queueInitialized => {
      if (queueInitialized) {
        logger.info('✅ Workflow queue initialized (Redis-backed)');
      } else {
        logger.info('⚠️  Workflow queue disabled (no Redis) - using direct execution');
      }
    }).catch(error => {
      logger.error({ error }, 'Failed to initialize workflow queue');
    });

    // Initialize workflow scheduler (for cron triggers)
    workflowScheduler.initialize().catch(error => {
      logger.error({ error }, 'Failed to initialize workflow scheduler');
    });
  }
}
