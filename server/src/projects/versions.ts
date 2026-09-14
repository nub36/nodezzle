/**
 * Версии проектов: снапшоты документа.
 *
 * Черновик (редактируемый документ) живёт в `projects`; версия —
 * полная копия документа на момент создания. Неизменяемые публикации
 * (LIVE) появятся в подэтапе 5.6.
 */

import crypto from 'node:crypto';
import type { Db } from '../db.ts';
import type { NodezzleProject } from '../../../src/core/project/schema.ts';

export interface VersionSummary {
  id: string;
  label: string;
  createdAt: string;
}

interface VersionRow {
  id: string;
  project_id: string;
  label: string;
  snapshot: string;
  created_at: string;
}

export interface VersionStore {
  create(projectId: string, snapshot: NodezzleProject, label: string): VersionSummary;
  list(projectId: string): VersionSummary[];
  get(projectId: string, versionId: string): NodezzleProject | null;
}

export function createVersionStore(db: Db): VersionStore {
  const insert = db.prepare(
    'INSERT INTO project_versions (id, project_id, label, snapshot, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const listStmt = db.prepare(
    'SELECT id, label, created_at FROM project_versions WHERE project_id = ? ORDER BY created_at DESC, id',
  );
  const getStmt = db.prepare('SELECT * FROM project_versions WHERE id = ? AND project_id = ?');

  return {
    create(projectId, snapshot, label) {
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      insert.run(id, projectId, label, JSON.stringify(snapshot), createdAt);
      return { id, label, createdAt };
    },
    list(projectId) {
      const rows = listStmt.all(projectId) as unknown as VersionRow[];
      return rows.map((r) => ({ id: r.id, label: r.label, createdAt: r.created_at }));
    },
    get(projectId, versionId) {
      const row = getStmt.get(versionId, projectId) as VersionRow | undefined;
      if (!row) return null;
      return JSON.parse(row.snapshot) as NodezzleProject;
    },
  };
}
