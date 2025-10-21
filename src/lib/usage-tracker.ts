/**
 * Client-side and server-side usage tracking helper
 *
 * Tracks Twitter API usage for rate limit monitoring
 */

import { logger } from './logger';
import { db, useSQLite } from './db';
import { appSettingsTable } from './schema';

export async function trackTwitterUsage(type: 'post' | 'read'): Promise<void> {
  try {
    // Server-side: Update database directly (more reliable)
    if (typeof window === 'undefined') {
      await trackUsageDirectly(type);
      return;
    }

    // Client-side: Call API endpoint
    await fetch('/api/twitter/usage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type }),
    });

    logger.debug({ type }, 'Tracked Twitter API usage');
  } catch (error) {
    // Don't throw - usage tracking should never break the main flow
    logger.error({ error, type }, 'Failed to track Twitter API usage');
  }
}

/**
 * Direct database tracking (server-side only)
 */
async function trackUsageDirectly(type: 'post' | 'read'): Promise<void> {
  const usageKey = type === 'post' ? 'twitter_post_usage' : 'twitter_read_usage';

  try {
    // Use the same table based on useSQLite flag
    const table = useSQLite
      ? (await import('./schema')).appSettingsTableSQLite
      : (await import('./schema')).appSettingsTablePostgres;

    const { eq } = await import('drizzle-orm');

    // Fetch current usage
    const existingRows = await db
      .select()
      .from(table)
      .where(eq(table.key, usageKey));

    const existing = existingRows[0];
    const now = Date.now();

    let usage = existing
      ? JSON.parse(existing.value)
      : {
          window15min: { count: 0, resetAt: now + 15 * 60 * 1000 },
          window1hr: { count: 0, resetAt: now + 60 * 60 * 1000 },
          window24hr: { count: 0, resetAt: now + 24 * 60 * 60 * 1000 },
          window30days: { count: 0, resetAt: now + 30 * 24 * 60 * 60 * 1000 },
        };

    // Reset expired windows
    if (usage.window15min.resetAt < now) {
      usage.window15min = { count: 0, resetAt: now + 15 * 60 * 1000 };
    }
    if (usage.window1hr.resetAt < now) {
      usage.window1hr = { count: 0, resetAt: now + 60 * 60 * 1000 };
    }
    if (usage.window24hr.resetAt < now) {
      usage.window24hr = { count: 0, resetAt: now + 24 * 60 * 60 * 1000 };
    }
    if (usage.window30days.resetAt < now) {
      usage.window30days = { count: 0, resetAt: now + 30 * 24 * 60 * 60 * 1000 };
    }

    // Increment all windows
    usage.window15min.count++;
    usage.window1hr.count++;
    usage.window24hr.count++;
    usage.window30days.count++;

    // Save back to database
    if (existing) {
      await db
        .update(table)
        .set({
          value: JSON.stringify(usage),
          updatedAt: useSQLite ? Math.floor(Date.now() / 1000) : new Date()
        })
        .where(eq(table.key, usageKey));
    } else {
      await db
        .insert(table)
        .values({ key: usageKey, value: JSON.stringify(usage) });
    }

    logger.debug({ type, usage }, 'Tracked Twitter API usage (direct)');
  } catch (error) {
    logger.error({ error, type }, 'Failed to track usage directly');
  }
}

/**
 * Track a post (tweet, reply, retweet, etc.)
 */
export function trackPost(): Promise<void> {
  return trackTwitterUsage('post');
}

/**
 * Track a read operation (search, fetch tweets, etc.)
 */
export function trackRead(): Promise<void> {
  return trackTwitterUsage('read');
}
