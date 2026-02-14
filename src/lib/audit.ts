import { db } from '@/lib/db';
import { apiAuditLogTable } from '@/lib/schema';
import { nanoid } from 'nanoid';
import { logger } from '@/lib/logger';

export interface AuditEventParams {
  apiKeyId: string;
  userId: string;
  action: string;
  resource?: string;
  requestMethod?: string;
  requestPath?: string;
  responseStatus?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    await db.insert(apiAuditLogTable).values({
      id: nanoid(),
      apiKeyId: params.apiKeyId,
      userId: params.userId,
      action: params.action,
      resource: params.resource ?? null,
      requestMethod: params.requestMethod ?? null,
      requestPath: params.requestPath ?? null,
      responseStatus: params.responseStatus ?? null,
      metadata: params.metadata ?? null,
      ipAddress: params.ipAddress ?? null,
    });
  } catch (error) {
    // Audit log failure must not block the request
    logger.error({ error, params }, 'Failed to write audit log entry');
  }
}
