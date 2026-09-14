/**
 * АПИ истории исполнений и журнала действий (подэтап 5.9E).
 *
 * Права проверяет сервер: исполнение и его шаги читают только члены
 * рабочего пространства исполнения; журнал — только члены пространства.
 * Пользовательских записи/изменения/удаления журнала нет.
 */

import { sendJson } from '../http.ts';
import { badRequest, notFound, unauthorized } from '../errors.ts';
import { currentUser, type AuthDeps } from './auth.ts';
import type { Router } from '../router.ts';
import type { WorkspaceStore } from '../workspaces/store.ts';
import type { ProjectStore } from '../projects/store.ts';
import type { ExecutionRecord, ExecutionStore, ExecutionStatus, StepStore } from '../execution/journal.ts';
import type { AuditStore } from '../audit/store.ts';

export interface HistoryDeps extends AuthDeps {
  workspaces: WorkspaceStore;
  projects: ProjectStore;
  executions: ExecutionStore;
  steps: StepStore;
  audit: AuditStore;
}

const EXECUTION_STATUSES: readonly ExecutionStatus[] = ['queued', 'running', 'success', 'error', 'stopped', 'timeout'];

/** Форма исполнения для интерфейса: источник, длительность, число шагов. */
function toExecutionView(execution: ExecutionRecord, steps: StepStore) {
  return {
    id: execution.id,
    projectId: execution.projectId,
    status: execution.status,
    source: execution.triggerSource,
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt,
    durationMs: execution.durationMs,
    errorCode: execution.errorCode,
    stepCount: steps.count(execution.id),
  };
}

function parsePagination(params: URLSearchParams): { limit: number; offset: number } {
  const limitRaw = params.get('limit');
  const offsetRaw = params.get('offset');
  const limit = limitRaw === null ? 25 : Number(limitRaw);
  const offset = offsetRaw === null ? 0 : Number(offsetRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw badRequest('Параметр "limit" должен быть целым числом от 1 до 100');
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw badRequest('Параметр "offset" должен быть целым числом не меньше 0');
  }
  return { limit, offset };
}

function parseStatus(params: URLSearchParams): ExecutionStatus | undefined {
  const raw = params.get('status');
  if (raw === null) return undefined;
  if (!EXECUTION_STATUSES.includes(raw as ExecutionStatus)) {
    throw badRequest('Неизвестный статус исполнения');
  }
  return raw as ExecutionStatus;
}

export function registerHistoryRoutes(router: Router, deps: HistoryDeps): void {
  // История исполнений проекта (новые → старые, пагинация, фильтр статуса).
  router.get('/api/projects/:id/executions', (ctx) => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    const row = deps.projects.get(ctx.params.id);
    if (!row || !deps.workspaces.isMember(row.workspaceId, user.id)) throw notFound('Проект не найден');
    const params = new URL(ctx.req.url ?? '/', 'http://history').searchParams;
    const pagination = parsePagination(params);
    const status = parseStatus(params);
    const executions = deps.executions
      .listForProject(ctx.params.id, { status, ...pagination })
      .map((e) => toExecutionView(e, deps.steps));
    sendJson(ctx.res, 200, { executions });
  });

  // Конкретное исполнение — чужие пространства не читаются.
  router.get('/api/executions/:executionId', (ctx) => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    const execution = deps.executions.get(ctx.params.executionId);
    if (!execution || !deps.workspaces.isMember(execution.workspaceId, user.id)) {
      throw notFound('Исполнение не найдено');
    }
    sendJson(ctx.res, 200, { execution: toExecutionView(execution, deps.steps) });
  });

  // Шаги исполнения (порядок выполнения).
  router.get('/api/executions/:executionId/steps', (ctx) => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    const execution = deps.executions.get(ctx.params.executionId);
    if (!execution || !deps.workspaces.isMember(execution.workspaceId, user.id)) {
      throw notFound('Исполнение не найдено');
    }
    sendJson(ctx.res, 200, { steps: deps.steps.list(ctx.params.executionId) });
  });

  // Журнал действий рабочего пространства — только чтение.
  router.get('/api/workspaces/:id/audit', (ctx) => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    const workspace = deps.workspaces.get(ctx.params.id);
    if (!workspace || !deps.workspaces.isMember(workspace.id, user.id)) {
      throw notFound('Рабочее пространство не найдено');
    }
    const params = new URL(ctx.req.url ?? '/', 'http://history').searchParams;
    const pagination = parsePagination(params);
    const action = params.get('action') ?? undefined;
    const targetType = params.get('targetType') ?? undefined;
    const entries = deps.audit.list(workspace.id, { action, targetType, ...pagination }).map((entry) => ({
      ...entry,
      metadata: entry.metadata === null ? null : (JSON.parse(entry.metadata) as Record<string, unknown>),
    }));
    sendJson(ctx.res, 200, { entries });
  });
}
