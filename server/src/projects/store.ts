/**
 * Хранилище проектов на сервере.
 *
 * Документ проекта хранится целиком (формат `NodezzleProject`,
 * JSON-строка); колонки — только индексы для списков. Валидация
 * документа выполняется тем же Zod, что и во фронтенде
 * (`src/core/project/schema.ts`) — клиент и сервер понимают один формат.
 */

import type { Db } from '../db.ts';
import type { NodezzleProject } from '../../../src/core/project/schema.ts';

export interface ProjectRow {
  id: string;
  workspaceId: string;
  document: NodezzleProject;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummaryRow {
  id: string;
  name: string;
  kind: string;
  updatedAt: string;
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
}

export interface ProjectStore {
  exists(id: string): boolean;
  create(workspaceId: string, document: NodezzleProject): ProjectRow;
  get(id: string): ProjectRow | null;
  listInWorkspace(workspaceId: string): ProjectSummaryRow[];
  update(id: string, document: NodezzleProject): void;
  delete(id: string): void;
}

function parseDoc(raw: string): NodezzleProject {
  return JSON.parse(raw) as NodezzleProject;
}

export function createProjectStore(db: Db): ProjectStore {
  const insert = db.prepare(
    `INSERT INTO projects (id, workspace_id, name, kind, format_version, document, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const getStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
  const existsStmt = db.prepare('SELECT 1 AS ok FROM projects WHERE id = ?');
  const listStmt = db.prepare(
    'SELECT id, name, kind, updated_at FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC',
  );
  const updateStmt = db.prepare(
    'UPDATE projects SET name = ?, kind = ?, format_version = ?, document = ?, updated_at = ? WHERE id = ?',
  );
  const deleteStmt = db.prepare('DELETE FROM projects WHERE id = ?');

  return {
    exists(id) {
      return existsStmt.get(id) !== undefined;
    },
    create(workspaceId, document) {
      const now = new Date().toISOString();
      insert.run(
        document.id,
        workspaceId,
        document.name,
        document.kind,
        document.formatVersion,
        JSON.stringify(document),
        now,
        now,
      );
      return { id: document.id, workspaceId, document, createdAt: now, updatedAt: now };
    },
    get(id) {
      const row = getStmt.get(id) as RawRow | undefined;
      if (!row) return null;
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        document: parseDoc(row.document),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
    listInWorkspace(workspaceId) {
      const rows = listStmt.all(workspaceId) as unknown as RawRow[];
      return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, updatedAt: r.updated_at }));
    },
    update(id, document) {
      updateStmt.run(
        document.name,
        document.kind,
        document.formatVersion,
        JSON.stringify(document),
        new Date().toISOString(),
        id,
      );
    },
    delete(id) {
      deleteStmt.run(id);
    },
  };
}
