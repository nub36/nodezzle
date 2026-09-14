/**
 * Журнал действий (подэтап 5.9): кто, когда и какое важное действие
 * совершил. Только добавление — изменение и удаление записей не
 * предусмотрены ни этим модулем, ни АПИ.
 *
 * Запись идёт ТОЛЬКО на сервере; метаданные проходят санитайзер,
 * поэтому пароли/токены/значения секретов сюда попасть не могут.
 */

import crypto from 'node:crypto';
import type { Db } from '../db.ts';
import { summarizeAuditMetadata } from '../security/sanitize.ts';

export interface AuditEntryInput {
  /** NULL — общесистемное действие; для пользовательских — обязательно. */
  workspaceId?: string | null;
  /** NULL — системный актор; подделка пользователя запрещена. */
  actorUserId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  /** Произвольные безопасные сведения; санитизируются при записи. */
  metadata?: unknown;
}

export interface AuditEntry {
  id: string;
  workspaceId: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: string | null;
  createdAt: string;
}

export interface AuditStore {
  append(entry: AuditEntryInput): void;
  /** Чтение владельцем пространства — только через АПИ с проверкой прав. */
  list(
    workspaceId: string,
    options: { action?: string; targetType?: string; limit: number; offset: number },
  ): AuditEntry[];
}

export function createAuditStore(db: Db): AuditStore {
  const listStmt = db.prepare(
    'SELECT * FROM audit_logs WHERE workspace_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?',
  );
  const listActionStmt = db.prepare(
    'SELECT * FROM audit_logs WHERE workspace_id = ? AND action = ? ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?',
  );
  // «auth.» с точкой на конце — фильтр по группе действий (префикс).
  const listActionGroupStmt = db.prepare(
    "SELECT * FROM audit_logs WHERE workspace_id = ? AND action LIKE ? ESCAPE '\\' ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?",
  );
  const insert = db.prepare(
    `INSERT INTO audit_logs
       (id, workspace_id, actor_user_id, action, target_type, target_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  return {
    append(entry) {
      insert.run(
        crypto.randomUUID(),
        entry.workspaceId ?? null,
        entry.actorUserId ?? null,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        summarizeAuditMetadata(entry.metadata ?? {}),
        new Date().toISOString(),
      );
    },
    list(workspaceId, options) {
      const rows = (
        options.action !== undefined
          ? options.action.endsWith('.')
            ? listActionGroupStmt.all(workspaceId, `${options.action}%`, options.limit, options.offset)
            : listActionStmt.all(workspaceId, options.action, options.limit, options.offset)
          : listStmt.all(workspaceId, options.limit, options.offset)
      ) as unknown as Array<{
        id: string;
        workspace_id: string | null;
        actor_user_id: string | null;
        action: string;
        target_type: string | null;
        target_id: string | null;
        metadata: string | null;
        created_at: string;
      }>;
      return rows
        .filter((r) => options.targetType === undefined || r.target_type === options.targetType)
        .map((r) => ({
          id: r.id,
          workspaceId: r.workspace_id,
          actorUserId: r.actor_user_id,
          action: r.action,
          targetType: r.target_type,
          targetId: r.target_id,
          metadata: r.metadata,
          createdAt: r.created_at,
        }));
    },
  };
}
