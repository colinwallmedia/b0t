#!/usr/bin/env tsx
/**
 * Clear all encrypted credentials from the database
 *
 * This script removes all entries from the user_credentials table.
 * Use this when you've changed the ENCRYPTION_KEY and need to re-enter credentials.
 *
 * Usage: npx tsx scripts/clear-credentials.ts
 */

import { db } from '../src/lib/db';
import { userCredentialsTable } from '../src/lib/schema';
import { sql } from 'drizzle-orm';

async function clearCredentials() {
  try {
    console.log('🗑️  Clearing all encrypted credentials from database...');

    // Count existing credentials
    const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM user_credentials`);
    const count = countResult.rows[0]?.count || 0;

    console.log(`Found ${count} credential(s) in database`);

    if (count === 0) {
      console.log('✅ No credentials to clear');
      process.exit(0);
    }

    // Delete all credentials
    await db.delete(userCredentialsTable);

    console.log('✅ Successfully cleared all credentials');
    console.log('');
    console.log('📝 Next steps:');
    console.log('1. Go to the web UI: http://localhost:3000');
    console.log('2. Navigate to Settings → Credentials');
    console.log('3. Re-enter your API keys (they will be encrypted with the current ENCRYPTION_KEY)');
    console.log('');
    console.log('Note: Your workflows are still intact, only the credentials need to be re-entered.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing credentials:', error);
    process.exit(1);
  }
}

clearCredentials();
