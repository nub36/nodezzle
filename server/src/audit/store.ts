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

export interface AuditStore {
  append(entry: AuditEntryInput): void;
}

export function createAuditStore(db: Db): AuditStore {
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
  };
}
