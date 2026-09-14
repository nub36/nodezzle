/**
 * Серверное исполнение опубликованных (только LIVE) схем — подэтап 5.7.
 *
 * Лимиты исполнения (план 06, раздел «Лимиты исполнения»):
 * - число шагов и повторов узла — внутренние константы исполнителя
 *   (`MAX_TOTAL_STEPS`, `MAX_NODE_EXECUTIONS` в `src/core/runtime/execute.ts`);
 * - глубина вложенности моделей — статическая проверка при публикации
 *   (`MODEL_DEPTH_EXCEEDED`) + ограничение здесь;
 * - размер полезной нагрузки — общий лимит тела запроса (`maxBodyBytes`);
 * - таймаут — `NODEZZLE_EXEC_TIMEOUT_MS` (отмена исполнения);
 * - параллельные исполнения — `NODEZZLE_EXEC_PARALLEL` (иначе 429).
 *
 * Рантайм использует ТОЛЬКО опубликованную версию — черновик не исполняется.
 */

import { executeCanvas } from '../../../src/core/runtime/execute.ts';
import type { NodezzleProject, StoredModel } from '../../../src/core/project/schema.ts';
import type { ExecutionResult, NodeRunInfo, TriggerPayload } from '../../../src/core/types/runtime.ts';

export interface ExecutionLimits {
  timeoutMs: number;
  maxParallel: number;
}

export interface ServerExecutionResult {
  status: ExecutionResult['status'] | 'timeout';
  error?: string;
  durationMs: number;
  outbox: ExecutionResult['outbox'];
  logs: ExecutionResult['logs'];
  /** Телеметрия узлов — источник шагов журнала (подэтап 5.9). */
  nodeRuns: Record<string, NodeRunInfo>;
}

let running = 0;

export function runningExecutions(): number {
  return running;
}

/** true — слот свободен и занят вызывающим; вызывающий обязан освободить. */
function acquireSlot(limits: ExecutionLimits): boolean {
  if (running >= limits.maxParallel) return false;
  running += 1;
  return true;
}

function releaseSlot(): void {
  running = Math.max(0, running - 1);
}

export async function runLiveExecution(
  project: NodezzleProject,
  payload: TriggerPayload,
  limits: ExecutionLimits,
): Promise<ServerExecutionResult> {
  if (!acquireSlot(limits)) {
    throw new ParallelLimitError();
  }
  const startedAt = Date.now();
  const cancel = { cancelled: false };
  try {
    const models: Record<string, StoredModel> = {};
    for (const model of project.models) models[model.id] = model;

    const execution = executeCanvas(project.canvas, {
      payload,
      models,
      cancel,
    });

    const timeout = new Promise<'timeout'>((resolve) => {
      const timer = setTimeout(() => {
        cancel.cancelled = true;
        resolve('timeout');
      }, limits.timeoutMs);
      // Таймер не должен держать процесс в тестах.
      if (typeof timer.unref === 'function') timer.unref();
    });

    const winner = await Promise.race([execution.then((r) => ({ kind: 'done' as const, result: r })), timeout]);
    if (winner === 'timeout') {
      return {
        status: 'timeout',
        error: 'Превышен лимит времени исполнения',
        durationMs: Date.now() - startedAt,
        outbox: [],
        logs: [],
        nodeRuns: {},
      };
    }
    const { result } = winner;
    return {
      status: result.status,
      error: result.error,
      durationMs: result.durationMs,
      outbox: result.outbox,
      logs: result.logs,
      nodeRuns: result.nodeRuns,
    };
  } finally {
    releaseSlot();
  }
}

/** Превышено число параллельных исполнений (отдельно от общего 429 АПИ). */
export class ParallelLimitError extends Error {
  constructor() {
    super('Превышено число параллельных исполнений');
    this.name = 'ParallelLimitError';
  }
}
