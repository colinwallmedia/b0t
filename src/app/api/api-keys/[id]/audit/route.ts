import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { apiAuditLogTable, apiKeysTable } from '@/lib/schema';
import { eq, and, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/api-keys/[id]/audit
 * Get audit log for a specific API key
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    // Verify this key belongs to the authenticated user
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

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));

    const entries = await db
      .select()
      .from(apiAuditLogTable)
      .where(eq(apiAuditLogTable.apiKeyId, id))
      .orderBy(desc(apiAuditLogTable.createdAt))
      .limit(limit);

    return NextResponse.json({ entries });
  } catch (error) {
    logger.error({ error }, 'Failed to get audit log');
    return NextResponse.json({ error: 'Failed to get audit log' }, { status: 500 });
  }
}
