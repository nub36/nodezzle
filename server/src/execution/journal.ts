/**
 * Хранилище исполнений и шагов (подэтап 5.9).
 *
 * Все сводки (входы/выходы шагов, источники) проходят через санитайзер
 * ДО записи — сюда не передают сырые полезные нагрузки.
 */

import crypto from 'node:crypto';
import type { Db } from '../db.ts';

export type ExecutionStatus = 'queued' | 'running' | 'success' | 'error' | 'stopped' | 'timeout';
export type StepStatus = 'success' | 'error' | 'stopped' | 'skipped';

/** Ограничение числа шагов на одно исполнение (см. план 06). */
export const MAX_STEPS_PER_EXECUTION = 500;

export interface ExecutionRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  projectVersionId: string | null;
  triggerType: string;
  triggerSource: string;
  telegramBotId: string | null;
  externalEventId: string | null;
  parentExecutionId: string | null;
  status: ExecutionStatus;
  errorCode: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface StepRecord {
  id: string;
  executionId: string;
  nodeId: string;
  blockType: string;
  sequence: number;
  status: StepStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
  inputSummary: string | null;
  outputSummary: string | null;
}

interface ExecutionRow {
  id: string;
  workspace_id: string;
  project_id: string;
  project_version_id: string | null;
  trigger_type: string;
  trigger_source: string;
  telegram_bot_id: string | null;
  external_event_id: string | null;
  parent_execution_id: string | null;
  status: string;
  error_code: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

interface StepRow {
  id: string;
  execution_id: string;
  node_id: string;
  block_type: string;
  sequence: number;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  error_code: string | null;
  input_summary: string | null;
  output_summary: string | null;
}

export interface StartExecutionInput {
  workspaceId: string;
  projectId: string;
  projectVersionId: string | null;
  triggerType: string;
  /** Уже санитизированная строка. */
  triggerSource: string;
  telegramBotId?: string | null;
  externalEventId?: string | null;
  parentExecutionId?: string | null;
}

export interface ExecutionStore {
  start(input: StartExecutionInput): ExecutionRecord;
  finish(
    id: string,
    outcome: { status: ExecutionStatus; errorCode?: string | null; durationMs?: number },
  ): void;
  get(id: string): ExecutionRecord | null;
  /** Новые → старые; фильтр по статусу необязателен. */
  listForProject(
    projectId: string,
    options: { status?: ExecutionStatus; limit: number; offset: number },
  ): ExecutionRecord[];
}

export interface StepStore {
  /** Возвращает `false`, если достигнут лимит шагов исполнения. */
  add(executionId: string, step: Omit<StepRecord, 'id' | 'executionId' | 'sequence'>): boolean;
  count(executionId: string): number;
  list(executionId: string): StepRecord[];
}

const executionFromRow = (r: ExecutionRow): ExecutionRecord => ({
  id: r.id,
  workspaceId: r.workspace_id,
  projectId: r.project_id,
  projectVersionId: r.project_version_id,
  triggerType: r.trigger_type,
  triggerSource: r.trigger_source,
  telegramBotId: r.telegram_bot_id,
  externalEventId: r.external_event_id,
  parentExecutionId: r.parent_execution_id,
  status: r.status as ExecutionStatus,
  errorCode: r.error_code,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  durationMs: r.duration_ms,
  createdAt: r.created_at,
});

const stepFromRow = (r: StepRow): StepRecord => ({
  id: r.id,
  executionId: r.execution_id,
  nodeId: r.node_id,
  blockType: r.block_type,
  sequence: r.sequence,
  status: r.status as StepStatus,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  durationMs: r.duration_ms,
  errorCode: r.error_code,
  inputSummary: r.input_summary,
  outputSummary: r.output_summary,
});

export function createExecutionStore(db: Db): ExecutionStore {
  const insert = db.prepare(
    `INSERT INTO executions
       (id, workspace_id, project_id, project_version_id, trigger_type, trigger_source,
        telegram_bot_id, external_event_id, parent_execution_id, status, started_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)`,
  );
  const update = db.prepare(
    'UPDATE executions SET status = ?, error_code = ?, finished_at = ?, duration_ms = ? WHERE id = ?',
  );
  const getStmt = db.prepare('SELECT * FROM executions WHERE id = ?');
  const listStmt = db.prepare(
    'SELECT * FROM executions WHERE project_id = ? ORDER BY created_at DESC, id LIMIT ? OFFSET ?',
  );
  const listStatusStmt = db.prepare(
    'SELECT * FROM executions WHERE project_id = ? AND status = ? ORDER BY created_at DESC, id LIMIT ? OFFSET ?',
  );

  return {
    start(input) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      insert.run(
        id,
        input.workspaceId,
        input.projectId,
        input.projectVersionId,
        input.triggerType,
        input.triggerSource,
        input.telegramBotId ?? null,
        input.externalEventId ?? null,
        input.parentExecutionId ?? null,
        now,
        now,
      );
      return this.get(id)!;
    },
    finish(id, outcome) {
      update.run(
        outcome.status,
        outcome.errorCode ?? null,
        new Date().toISOString(),
        outcome.durationMs ?? null,
        id,
      );
    },
    get(id) {
      const row = getStmt.get(id) as unknown as ExecutionRow | undefined;
      return row ? executionFromRow(row) : null;
    },
    listForProject(projectId, options) {
      const rows = (
        options.status !== undefined
          ? listStatusStmt.all(projectId, options.status, options.limit, options.offset)
          : listStmt.all(projectId, options.limit, options.offset)
      ) as unknown as ExecutionRow[];
      return rows.map(executionFromRow);
    },
  };
}

export function createStepStore(db: Db): StepStore {
  const insert = db.prepare(
    `INSERT INTO execution_steps
       (id, execution_id, node_id, block_type, sequence, status,
        started_at, finished_at, duration_ms, error_code, input_summary, output_summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const countStmt = db.prepare('SELECT COUNT(*) AS n FROM execution_steps WHERE execution_id = ?');
  const listStmt = db.prepare('SELECT * FROM execution_steps WHERE execution_id = ? ORDER BY sequence');

  return {
    add(executionId, step) {
      const row = countStmt.get(executionId) as unknown as { n: number };
      if (row.n >= MAX_STEPS_PER_EXECUTION) return false;
      insert.run(
        crypto.randomUUID(),
        executionId,
        step.nodeId,
        step.blockType,
        row.n + 1,
        step.status,
        step.startedAt,
        step.finishedAt,
        step.durationMs,
        step.errorCode,
        step.inputSummary,
        step.outputSummary,
      );
      return true;
    },
    count(executionId) {
      const row = countStmt.get(executionId) as unknown as { n: number };
      return row.n;
    },
    list(executionId) {
      const rows = listStmt.all(executionId) as unknown as StepRow[];
      return rows.map(stepFromRow);
    },
  };
}
