/** Миграции 009–011: исполнения, шаги, журнал действий. */

import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, runMigrations, type Db } from './db.ts';

let db: Db;

beforeEach(() => {
  db = openDb(':memory:');
  runMigrations(db, path.join(process.cwd(), 'server', 'migrations'));
});

afterEach(() => db.close());

function seedWorkspaceAndProject(): { workspaceId: string; projectId: string } {
  const now = new Date().toISOString();
  db.prepare('INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    'u1', 'j@example.ru', 'h', 'Журнал', now, now,
  );
  db.prepare('INSERT INTO workspaces (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    'w1', 'u1', 'Пространство', now, now,
  );
  db.prepare(
    'INSERT INTO projects (id, workspace_id, name, kind, format_version, document, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run('p1', 'w1', 'Проект', 'telegram', 1, '{}', new Date().toISOString(), new Date().toISOString());
  return { workspaceId: 'w1', projectId: 'p1' };
}

describe('Журнальная схема (5.9A)', () => {
  it('создаёт исполнения и шаги с контролируемыми статусами', () => {
    const { workspaceId, projectId } = seedWorkspaceAndProject();
    db.prepare(
      `INSERT INTO executions (id, workspace_id, project_id, trigger_type, status, created_at)
       VALUES (?, ?, ?, 'telegram', 'running', ?)`,
    ).run('e1', workspaceId, projectId, new Date().toISOString());
    db.prepare(
      `INSERT INTO execution_steps
         (id, execution_id, node_id, block_type, sequence, status, input_summary, output_summary)
       VALUES (?, 'e1', 'n1', 'core.text', 1, 'success', '{}', '{}')`,
    ).run('s1');

    const exec = db.prepare('SELECT status FROM executions WHERE id = ?').get('e1') as unknown as { status: string };
    expect(exec.status).toBe('running');
    const step = db.prepare('SELECT sequence, block_type FROM execution_steps WHERE execution_id = ?').get('e1') as unknown as {
      sequence: number;
      block_type: string;
    };
    expect(step.sequence).toBe(1);
    expect(step.block_type).toBe('core.text');
  });

  it('произвольные статусы отклоняются (исполнение и шаг)', () => {
    const { workspaceId, projectId } = seedWorkspaceAndProject();
    expect(() =>
      db.prepare(
        `INSERT INTO executions (id, workspace_id, project_id, trigger_type, status, created_at)
         VALUES ('e2', ?, ?, 'api', 'какой угодно', ?)`,
      ).run(workspaceId, projectId, new Date().toISOString()),
    ).toThrow();
    db.prepare(
      `INSERT INTO executions (id, workspace_id, project_id, trigger_type, status, created_at)
       VALUES ('e3', ?, ?, 'api', 'queued', ?)`,
    ).run(workspaceId, projectId, new Date().toISOString());
    expect(() =>
      db.prepare(
        `INSERT INTO execution_steps (id, execution_id, node_id, block_type, sequence, status)
         VALUES ('sx', 'e3', 'n', 'core.text', 1, 'взломано')`,
      ).run(),
    ).toThrow();
  });

  it('шаги удаляются каскадно вместе с исполнением', () => {
    const { workspaceId, projectId } = seedWorkspaceAndProject();
    db.prepare(
      `INSERT INTO executions (id, workspace_id, project_id, trigger_type, status, created_at)
       VALUES ('e4', ?, ?, 'api', 'success', ?)`,
    ).run(workspaceId, projectId, new Date().toISOString());
    db.prepare(
      `INSERT INTO execution_steps (id, execution_id, node_id, block_type, sequence, status)
       VALUES ('st1', 'e4', 'n1', 'core.text', 1, 'success')`,
    ).run();
    db.prepare('DELETE FROM executions WHERE id = ?').run('e4');
    const left = db.prepare('SELECT COUNT(*) AS n FROM execution_steps WHERE execution_id = ?').get('e4') as unknown as { n: number };
    expect(left.n).toBe(0);
  });

  it('журнал действий принимает записи, включая системного актора', () => {
    db.prepare(
      `INSERT INTO audit_logs (id, workspace_id, actor_user_id, action, target_type, target_id, metadata, created_at)
       VALUES ('a1', NULL, NULL, 'system.migration', NULL, NULL, '{}', ?)`,
    ).run(new Date().toISOString());
    const row = db.prepare('SELECT action FROM audit_logs WHERE id = ?').get('a1') as unknown as { action: string };
    expect(row.action).toBe('system.migration');
  });

  it('индексы для рабочих запросов созданы', () => {
    const indexes = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'").all() as unknown as Array<{
        name: string;
      }>
    ).map((r) => r.name);
    for (const expected of [
      'idx_exec_project_created',
      'idx_exec_workspace_created',
      'idx_exec_status',
      'idx_steps_execution_seq',
      'idx_audit_workspace_created',
      'idx_audit_workspace_action',
    ]) {
      expect(indexes).toContain(expected);
    }
  });
});
