import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiKeysTable } from '@/lib/schema';
import type { ApiKeyPermissions } from '@/lib/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { hashApiKey } from '@/lib/api-keys';

export type ApiKeyAuthResult =
  | { error: string; status: number }
  | { apiKey: typeof apiKeysTable.$inferSelect; userId: string; permissions: ApiKeyPermissions };

export async function validateApiKey(request: NextRequest): Promise<ApiKeyAuthResult> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer b0t_')) {
    return { error: 'Missing or invalid API key', status: 401 };
  }

  const key = authHeader.replace('Bearer ', '');
  const keyHash = hashApiKey(key);

  const [apiKey] = await db
    .select()
    .from(apiKeysTable)
    .where(
      and(
        eq(apiKeysTable.keyHash, keyHash),
        eq(apiKeysTable.isActive, true),
        isNull(apiKeysTable.revokedAt)
      )
    )
    .limit(1);

  if (!apiKey) {
    return { error: 'Invalid or revoked API key', status: 401 };
  }

  // Check expiry
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return { error: 'API key has expired', status: 401 };
  }

  // Update last used timestamp (non-blocking)
  db.update(apiKeysTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeysTable.id, apiKey.id))
    .execute()
    .catch(() => {}); // Don't fail the request if this fails

  return {
    apiKey,
    userId: apiKey.userId,
    permissions: apiKey.permissions as ApiKeyPermissions,
  };
}

export function checkPermission(
  permissions: ApiKeyPermissions,
  resource: keyof ApiKeyPermissions,
  action: string
): boolean {
  const resourcePerms = permissions[resource];
  if (!resourcePerms) return false;
  return (resourcePerms as Record<string, boolean>)[action] === true;
}
