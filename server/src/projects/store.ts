/**
 * Хранилище проектов на сервере.
 *
 * Документ проекта хранится целиком (формат `NodezzleProject`,
 * JSON-строка); колонки — только индексы для списков. Валидация
 * документа выполняется тем же Zod, что и во фронтенде
 * (`src/core/project/schema.ts`) — клиент и сервер понимают один формат.
 */

import { randomBytes } from 'node:crypto';
import type { Db } from '../db.ts';
import type { NodezzleProject } from '../../../src/core/project/schema.ts';

export interface ProjectRow {
  id: string;
  workspaceId: string;
  document: NodezzleProject;
  createdAt: string;
  updatedAt: string;
  revision: string;
}

export interface ProjectSummaryRow {
  id: string;
  name: string;
  kind: string;
  updatedAt: string;
  revision: string;
}

interface RawRow {
  id: string;
  workspace_id: string;
  name: string;
  kind: string;
  format_version: number;
  document: string;
  created_at: string;
  updated_at: string;
  revision: string;
}

export interface ProjectStore {
  exists(id: string): boolean;
  create(workspaceId: string, document: NodezzleProject): ProjectRow;
  get(id: string): ProjectRow | null;
  listInWorkspace(workspaceId: string): ProjectSummaryRow[];
  /** Только compare-and-swap; null означает, что условие записи не выполнено. */
  update(id: string, document: NodezzleProject, expectedRevision: string): ProjectRow | null;
  delete(id: string, expectedRevision: string): boolean;
}

function fromRaw(row: RawRow): ProjectRow {
  return { id: row.id, workspaceId: row.workspace_id, document: JSON.parse(row.document) as NodezzleProject,
    createdAt: row.created_at, updatedAt: row.updated_at, revision: row.revision };
}
const newRevision = () => randomBytes(16).toString('hex');

export function createProjectStore(db: Db): ProjectStore {
  const insert = db.prepare(
    `INSERT INTO projects (id, workspace_id, name, kind, format_version, document, created_at, updated_at, revision)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const getStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
  const existsStmt = db.prepare('SELECT 1 AS ok FROM projects WHERE id = ?');
  const listStmt = db.prepare(
    'SELECT id, name, kind, updated_at, revision FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC',
  );
  const updateStmt = db.prepare(
    'UPDATE projects SET name = ?, kind = ?, format_version = ?, document = ?, updated_at = ?, revision = ? WHERE id = ? AND revision = ? RETURNING *',
  );
  const deleteStmt = db.prepare('DELETE FROM projects WHERE id = ? AND revision = ?');

  return {
    exists(id) {
      return existsStmt.get(id) !== undefined;
    },
    create(workspaceId, document) {
      const now = new Date().toISOString();
      const revision = newRevision();
      insert.run(
        document.id,
        workspaceId,
        document.name,
        document.kind,
        document.formatVersion,
        JSON.stringify(document),
        now,
        now,
        revision,
      );
      return { id: document.id, workspaceId, document, createdAt: now, updatedAt: now, revision };
    },
    get(id) {
      const row = getStmt.get(id) as RawRow | undefined;
      if (!row) return null;
      return fromRaw(row);
    },
    listInWorkspace(workspaceId) {
      const rows = listStmt.all(workspaceId) as unknown as RawRow[];
      return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, updatedAt: r.updated_at, revision: r.revision }));
    },
    update(id, document, expectedRevision) {
      // Защита есть и на уровне store: обход HTTP не меняет ID документа.
      if (document.id !== id) throw new Error('Идентификатор документа не совпадает');
      const row = updateStmt.get(
        document.name,
        document.kind,
        document.formatVersion,
        JSON.stringify(document),
        new Date().toISOString(),
        newRevision(),
        id,
        expectedRevision,
      ) as RawRow | undefined;
      return row ? fromRaw(row) : null;
    },
    delete(id, expectedRevision) {
      return deleteStmt.run(id, expectedRevision).changes === 1;
    },
  };
}
