/**
 * Исполнение с журналированием (подэтап 5.9): исполнение + шаги
 * пишутся в БД; сводки входов/выходов проходят санитайзер.
 */

import type { NodezzleProject } from '../../../src/core/project/schema.ts';
import type { TriggerPayload } from '../../../src/core/types/runtime.ts';
import { summarize } from '../security/sanitize.ts';
import { runLiveExecution, type ExecutionLimits, type ServerExecutionResult } from './run.ts';
import type { ExecutionStore, StepStore, StepStatus } from './journal.ts';

export interface TrackedRunInput {
  workspaceId: string;
  projectId: string;
  projectVersionId: string | null;
  triggerType: string;
  /** Уже санитизированная строка источника. */
  triggerSource: string;
  payload: TriggerPayload;
  limits: ExecutionLimits;
  telegramBotId?: string | null;
  externalEventId?: string | null;
}

export interface TrackedRunDeps {
  executions: ExecutionStore;
  steps: StepStore;
}

const STATUS_TO_JOURNAL: Record<ServerExecutionResult['status'], 'success' | 'error' | 'stopped' | 'timeout'> = {
  success: 'success',
  waiting: 'success', // рантайм завершился без ошибки
  error: 'error',
  stopped: 'stopped',
  timeout: 'timeout',
};

export async function runTrackedExecution(
  deps: TrackedRunDeps,
  input: TrackedRunInput,
  document: NodezzleProject,
): Promise<ServerExecutionResult> {
  const execution = deps.executions.start({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    projectVersionId: input.projectVersionId,
    triggerType: input.triggerType,
    triggerSource: input.triggerSource,
    telegramBotId: input.telegramBotId ?? null,
    externalEventId: input.externalEventId ?? null,
  });

  let result: ServerExecutionResult;
  try {
    result = await runLiveExecution(document, input.payload, input.limits);
  } catch (err) {
    deps.executions.finish(execution.id, { status: 'error', errorCode: 'RUNTIME_FAILURE' });
    throw err;
  }

  // Шаги — из телеметрии рантайма, по порядку начала узлов.
  const nodeBlocks = new Map(document.canvas.nodes.map((n) => [n.id, n.blockId]));
  const runs = Object.entries(result.nodeRuns ?? {}).sort((a, b) => a[1].startedAt - b[1].startedAt);
  for (const [nodeId, run] of runs) {
    const status: StepStatus =
      run.status === 'success' ? 'success' : run.status === 'error' ? 'error' : 'skipped';
    deps.steps.add(execution.id, {
      nodeId,
      blockType: nodeBlocks.get(nodeId) ?? 'unknown',
      status,
      startedAt: new Date(run.startedAt).toISOString(),
      finishedAt: run.finishedAt !== undefined ? new Date(run.finishedAt).toISOString() : null,
      durationMs: run.durationMs,
      errorCode: run.error ?? null,
      inputSummary: summarize(run.inputs),
      outputSummary: summarize(run.outputs),
    });
  }

  deps.executions.finish(execution.id, {
    status: STATUS_TO_JOURNAL[result.status],
    errorCode: result.error ?? null,
    durationMs: result.durationMs,
  });
  return result;
}
