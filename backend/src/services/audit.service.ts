import { query } from '../db';
import { AuditLog } from '../types';

export interface CreateAuditLogParams {
  schoolId?: string | null;
  actorUserId: string;
  actionType: string;
  entityType: string;
  entityId: string;
  metaJson?: Record<string, any>;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(params: CreateAuditLogParams): Promise<AuditLog> {
  const result = await query<AuditLog>(
    `INSERT INTO audit_log
     (school_id, actor_user_id, action_type, entity_type, entity_id, meta_json)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      params.schoolId || null,
      params.actorUserId,
      params.actionType,
      params.entityType,
      params.entityId,
      params.metaJson ? JSON.stringify(params.metaJson) : null,
    ]
  );
  return result.rows[0];
}

/**
 * Get audit logs with filtering
 */
export async function getAuditLogs(params: {
  schoolId?: string;
  actorUserId?: string;
  actionType?: string;
  entityType?: string;
  limit?: number;
  offset?: number;
}): Promise<{ logs: AuditLog[]; total: number }> {
  const conditions: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (params.schoolId !== undefined) {
    conditions.push(`school_id = $${paramIndex++}`);
    values.push(params.schoolId);
  }

  if (params.actorUserId) {
    conditions.push(`actor_user_id = $${paramIndex++}`);
    values.push(params.actorUserId);
  }

  if (params.actionType) {
    conditions.push(`action_type = $${paramIndex++}`);
    values.push(params.actionType);
  }

  if (params.entityType) {
    conditions.push(`entity_type = $${paramIndex++}`);
    values.push(params.entityType);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM audit_log ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Get logs
  const limit = params.limit || 50;
  const offset = params.offset || 0;

  const logsResult = await query<AuditLog>(
    `SELECT * FROM audit_log ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...values, limit, offset]
  );

  return {
    logs: logsResult.rows,
    total,
  };
}

/**
 * Clean old audit logs (optional maintenance task)
 */
export async function cleanOldAuditLogs(daysToKeep: number = 365): Promise<number> {
  const result = await query(
    `DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'`
  );
  return result.rowCount || 0;
}
