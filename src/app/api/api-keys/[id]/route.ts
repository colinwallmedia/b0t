import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { apiKeysTable } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/api-keys/[id]
 * Revoke a specific API key
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

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
