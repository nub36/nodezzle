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

export type VersionStatus = 'SNAPSHOT' | 'LIVE' | 'ARCHIVED';

export interface VersionSummary {
  id: string;
  label: string;
  status: VersionStatus;
  createdAt: string;
}

interface VersionRow {
  id: string;
  project_id: string;
  label: string;
  status: string;
  snapshot: string;
  created_at: string;
}

export interface VersionStore {
  create(projectId: string, snapshot: NodezzleProject, label: string, status?: VersionStatus): VersionSummary;
  list(projectId: string): VersionSummary[];
  get(projectId: string, versionId: string): NodezzleProject | null;
  /** Текущая опубликованная (LIVE) версия проекта, если есть. */
  findLive(projectId: string): VersionSummary | null;
  /** Прежняя публикация переводится в архив перед новой. */
  archiveLive(projectId: string): void;
}

export function createVersionStore(db: Db): VersionStore {
  const insert = db.prepare(
    'INSERT INTO project_versions (id, project_id, label, status, snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const liveStmt = db.prepare(
    "SELECT id, label, status, created_at FROM project_versions WHERE project_id = ? AND status = 'LIVE'",
  );
  const archiveStmt = db.prepare(
    "UPDATE project_versions SET status = 'ARCHIVED' WHERE project_id = ? AND status = 'LIVE'",
  );
  const listStmt = db.prepare(
    'SELECT id, label, status, created_at FROM project_versions WHERE project_id = ? ORDER BY created_at DESC, id',
  );
  const getStmt = db.prepare('SELECT * FROM project_versions WHERE id = ? AND project_id = ?');

  return {
    create(projectId, snapshot, label, status: VersionStatus = 'SNAPSHOT') {
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      insert.run(id, projectId, label, status, JSON.stringify(snapshot), createdAt);
      return { id, label, status, createdAt };
    },
    list(projectId) {
      const rows = listStmt.all(projectId) as unknown as VersionRow[];
      return rows.map((r) => ({
        id: r.id,
        label: r.label,
        status: r.status as VersionStatus,
        createdAt: r.created_at,
      }));
    },
    get(projectId, versionId) {
      const row = getStmt.get(versionId, projectId) as VersionRow | undefined;
      if (!row) return null;
      return JSON.parse(row.snapshot) as NodezzleProject;
    },
    findLive(projectId) {
      const row = liveStmt.get(projectId) as VersionRow | undefined;
      if (!row) return null;
      return { id: row.id, label: row.label, status: 'LIVE', createdAt: row.created_at };
    },
    archiveLive(projectId) {
      archiveStmt.run(projectId);
    },
  };
}
