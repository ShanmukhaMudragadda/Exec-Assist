import { PrismaClient } from '@prisma/client';
import { Request } from 'express';

const prisma = new PrismaClient();

interface AuditParams {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  entityTitle?: string;
  metadata?: Record<string, unknown>;
  req?: Request;
}

const AUDIT_ENABLED = process.env.AUDIT_LOGS === 'true';

export function logAudit(params: AuditParams): void {
  if (!AUDIT_ENABLED) return;
  const { userId, action, entityType, entityId, entityTitle, metadata, req } = params;
  const ipAddress = req
    ? ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket.remoteAddress)
    : undefined;
  const userAgent = req ? (req.headers['user-agent'] ?? undefined) : undefined;

  prisma.auditLog
    .create({
      data: {
        userId: userId ?? null,
        action,
        entityType,
        entityId,
        entityTitle,
        metadata: metadata as any,
        ipAddress,
        userAgent,
      },
    })
    .catch((err) => console.error('[audit] failed to log:', err));
}
