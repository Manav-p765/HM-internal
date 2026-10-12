import type { Request } from 'express';
import { query } from '../db.js';

export type AuditAction =
  | 'auth.login_success'
  | 'auth.login_failure'
  | 'auth.logout'
  | 'auth.password_changed'
  | 'auth.password_reset_requested'
  | 'auth.password_reset_completed'
  | 'user.created'
  | 'user.updated'
  | 'user.disabled'
  | 'user.enabled'
  | 'user.credentials_resent';

interface AuditEntry {
  action: AuditAction;
  actorUserId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>; // never put passwords or tokens in here
}

// Writes one audit row. A failed audit write is logged but does not fail the request.
export async function audit(req: Request | null, entry: AuditEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.actorUserId ?? req?.user?.id ?? null,
        entry.action,
        entry.entityType ?? null,
        entry.entityId ?? null,
        JSON.stringify(entry.metadata ?? {}),
        req?.ip ?? null,
      ],
    );
  } catch (err) {
    console.error(`Failed to write audit log (${entry.action})`, err);
  }
}
