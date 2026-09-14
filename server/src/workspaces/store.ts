/**
 * Хранилище рабочих пространств и участников.
 * Право доступа проверяется сервером по `workspace_members` —
 * разрешениям клиента сервер не доверяет.
 */

import crypto from 'node:crypto';
import type { Db } from '../db.ts';

export interface WorkspaceRecord {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceRow {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceStore {
  create(ownerId: string, name: string): WorkspaceRecord;
  listForUser(userId: string): WorkspaceRecord[];
  get(id: string): WorkspaceRecord | null;
  /** Является ли пользователь участником пространства. */
  isMember(workspaceId: string, userId: string): boolean;
}

function toRecord(row: WorkspaceRow): WorkspaceRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createWorkspaceStore(db: Db): WorkspaceStore {
  const insert = db.prepare(
    'INSERT INTO workspaces (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  );
  const insertMember = db.prepare(
    'INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)',
  );
  const listStmt = db.prepare(
    `SELECT w.* FROM workspaces w
     JOIN workspace_members m ON m.workspace_id = w.id
     WHERE m.user_id = ? ORDER BY w.created_at`,
  );
  const getStmt = db.prepare('SELECT * FROM workspaces WHERE id = ?');
  const memberStmt = db.prepare(
    'SELECT 1 AS ok FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
  );

  return {
    create(ownerId, name) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.exec('BEGIN;');
      try {
        insert.run(id, ownerId, name, now, now);
        insertMember.run(id, ownerId, 'owner', now);
        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
      return { id, ownerId, name, createdAt: now, updatedAt: now };
    },
    listForUser(userId) {
      const rows = listStmt.all(userId) as unknown as WorkspaceRow[];
      return rows.map(toRecord);
    },
    get(id) {
      const row = getStmt.get(id) as WorkspaceRow | undefined;
      return row ? toRecord(row) : null;
    },
    isMember(workspaceId, userId) {
      return memberStmt.get(workspaceId, userId) !== undefined;
    },
  };
}
