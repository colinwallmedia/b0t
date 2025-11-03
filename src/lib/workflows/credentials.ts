import { postgresDb } from '@/lib/db';
import { userCredentialsTablePostgres } from '@/lib/schema';
import { encrypt, decrypt } from '@/lib/encryption';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';

/**
 * Workflow Credentials Manager
 *
 * Securely store and retrieve API keys, tokens, and secrets for workflows.
 * All credentials are encrypted at rest using AES-256.
 */

export interface CredentialInput {
  platform: string; // openai, anthropic, stripe, slack, custom
  name: string; // User-friendly name
  value: string; // The actual credential (API key, token, etc.)
  type: 'api_key' | 'token' | 'secret' | 'connection_string';
  metadata?: Record<string, unknown>; // Optional extra info
}

/**
 * Store a new credential for a user
 */
export async function storeCredential(
  userId: string,
  input: CredentialInput
): Promise<{ id: string }> {
  logger.info({ userId, platform: input.platform, type: input.type }, 'Storing credential');

  if (!postgresDb) {
    throw new Error('Database not initialized');
  }

  const id = randomUUID();
  const encryptedValue = encrypt(input.value);

  await postgresDb.insert(userCredentialsTablePostgres).values({
    id,
    userId,
    platform: input.platform.toLowerCase(),
    name: input.name,
    encryptedValue,
    type: input.type,
    metadata: input.metadata || null,
  });

  logger.info({ id, platform: input.platform }, 'Credential stored successfully');

  return { id };
}

/**
 * Get a credential for a user and platform
 */
export async function getCredential(
  userId: string,
  platform: string
): Promise<string | null> {
  logger.info({ userId, platform }, 'Retrieving credential');

  if (!postgresDb) {
    throw new Error('Database not initialized');
  }

  const credentials = await postgresDb
    .select()
    .from(userCredentialsTablePostgres)
    .where(
      and(
        eq(userCredentialsTablePostgres.userId, userId),
        eq(userCredentialsTablePostgres.platform, platform.toLowerCase())
      )
    )
    .limit(1);

  if (credentials.length === 0) {
    logger.warn({ userId, platform }, 'Credential not found');
    return null;
  }

  const credential = credentials[0];

  // Update last used timestamp
  await postgresDb
    .update(userCredentialsTablePostgres)
    .set({ lastUsed: new Date() })
    .where(eq(userCredentialsTablePostgres.id, credential.id));

  const decryptedValue = decrypt(credential.encryptedValue);

  logger.info({ userId, platform, credentialId: credential.id }, 'Credential retrieved');

  return decryptedValue;
}

/**
 * List all credentials for a user (without decrypted values)
 */
export async function listCredentials(userId: string): Promise<
  Array<{
    id: string;
    platform: string;
    name: string;
    type: string;
    createdAt: Date | null;
    lastUsed: Date | null;
  }>
> {
  if (!postgresDb) {
    throw new Error('Database not initialized');
  }

  const credentials = await postgresDb
    .select({
      id: userCredentialsTablePostgres.id,
      platform: userCredentialsTablePostgres.platform,
      name: userCredentialsTablePostgres.name,
      type: userCredentialsTablePostgres.type,
      createdAt: userCredentialsTablePostgres.createdAt,
      lastUsed: userCredentialsTablePostgres.lastUsed,
    })
    .from(userCredentialsTablePostgres)
    .where(eq(userCredentialsTablePostgres.userId, userId));

  return credentials;
}

/**
 * Delete a credential
 */
export async function deleteCredential(userId: string, credentialId: string): Promise<void> {
  logger.info({ userId, credentialId }, 'Deleting credential');

  if (!postgresDb) {
    throw new Error('Database not initialized');
  }

  await postgresDb
    .delete(userCredentialsTablePostgres)
    .where(
      and(
        eq(userCredentialsTablePostgres.id, credentialId),
        eq(userCredentialsTablePostgres.userId, userId)
      )
    );

  logger.info({ userId, credentialId }, 'Credential deleted');
}

/**
 * Update a credential value
 */
export async function updateCredential(
  userId: string,
  credentialId: string,
  newValue: string
): Promise<void> {
  logger.info({ userId, credentialId }, 'Updating credential');

  if (!postgresDb) {
    throw new Error('Database not initialized');
  }

  const encryptedValue = encrypt(newValue);

  await postgresDb
    .update(userCredentialsTablePostgres)
    .set({ encryptedValue })
    .where(
      and(
        eq(userCredentialsTablePostgres.id, credentialId),
        eq(userCredentialsTablePostgres.userId, userId)
      )
    );

  logger.info({ userId, credentialId }, 'Credential updated');
}
