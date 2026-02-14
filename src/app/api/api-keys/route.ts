import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { apiKeysTable } from '@/lib/schema';
import type { ApiKeyPermissions } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';
import { generateApiKey } from '@/lib/api-keys';
import { logger } from '@/lib/logger';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';

/**
 * GET /api/api-keys
 * List all API keys for the authenticated user (no sensitive values returned)
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const keys = await db
      .select({
        id: apiKeysTable.id,
        name: apiKeysTable.name,
        keyPrefix: apiKeysTable.keyPrefix,
        permissions: apiKeysTable.permissions,
        lastUsedAt: apiKeysTable.lastUsedAt,
        expiresAt: apiKeysTable.expiresAt,
        isActive: apiKeysTable.isActive,
        createdAt: apiKeysTable.createdAt,
        revokedAt: apiKeysTable.revokedAt,
      })
      .from(apiKeysTable)
      .where(eq(apiKeysTable.userId, session.user.id))
      .orderBy(apiKeysTable.createdAt);

    return NextResponse.json({ keys });
  } catch (error) {
    logger.error({ error }, 'Failed to list API keys');
    return NextResponse.json({ error: 'Failed to list API keys' }, { status: 500 });
  }
}

/**
 * POST /api/api-keys
 * Create a new API key — the raw key is returned ONCE and never stored
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, permissions, expiresAt } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: 'name is required' },
        { status: 400 }
      );
    }

    if (!permissions || typeof permissions !== 'object') {
      return NextResponse.json(
        { error: 'Validation failed', details: 'permissions object is required' },
        { status: 400 }
      );
    }

    const defaultPermissions: ApiKeyPermissions = {
      workflows: { create: false, read: true, update: false, delete: false, execute: false },
      modules: { read: true },
      credentials: { read: true, create: false, delete: false },
      clients: { read: true, create: false, update: false },
    };

    const mergedPermissions: ApiKeyPermissions = {
      workflows: { ...defaultPermissions.workflows, ...permissions.workflows },
      modules: { ...defaultPermissions.modules, ...permissions.modules },
      credentials: { ...defaultPermissions.credentials, ...permissions.credentials },
      clients: { ...defaultPermissions.clients, ...permissions.clients },
    };

    const { key, hash, prefix } = generateApiKey();
    const id = nanoid();

    await db.insert(apiKeysTable).values({
      id,
      name: name.trim(),
      keyHash: hash,
      keyPrefix: prefix,
      userId: session.user.id,
      permissions: mergedPermissions,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: true,
    });

    logger.info({ userId: session.user.id, keyId: id, name }, 'API key created');

    // Return the raw key ONCE — it cannot be retrieved again
    return NextResponse.json(
      {
        id,
        key,
        name: name.trim(),
        keyPrefix: prefix,
        permissions: mergedPermissions,
        expiresAt: expiresAt ?? null,
        createdAt: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error({ error }, 'Failed to create API key');
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }
}

/**
 * DELETE /api/api-keys
 * Revoke (soft-delete) all API keys for the authenticated user — not normally exposed;
 * individual key revocation is handled via /api/api-keys/[id]
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Key ID is required' }, { status: 400 });
    }

    const [key] = await db
      .select({ id: apiKeysTable.id })
      .from(apiKeysTable)
      .where(
        and(
          eq(apiKeysTable.id, id),
          eq(apiKeysTable.userId, session.user.id)
        )
      )
      .limit(1);

    if (!key) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    await db
      .update(apiKeysTable)
      .set({ isActive: false, revokedAt: new Date() })
      .where(
        and(
          eq(apiKeysTable.id, id),
          eq(apiKeysTable.userId, session.user.id)
        )
      );

    logger.info({ userId: session.user.id, keyId: id }, 'API key revoked');

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to revoke API key');
    return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 });
  }
}
