/**
 * Исполнение опубликованной схемы на сервере (подэтап 5.7).
 * Рантайм использует ТОЛЬКО опубликованную (LIVE) версию.
 */

import { sendJson, readJsonBody } from '../http.ts';
import { badRequest, notFound, tooManyRequests, unauthorized } from '../errors.ts';
import { currentUser, type AuthDeps } from './auth.ts';
import type { RouteContext, Router } from '../router.ts';
import type { WorkspaceStore } from '../workspaces/store.ts';
import type { ProjectStore } from '../projects/store.ts';
import type { VersionStore } from '../projects/versions.ts';
import { ParallelLimitError, type ExecutionLimits } from '../execution/run.ts';
import { runTrackedExecution } from '../execution/record.ts';
import type { ExecutionStore, StepStore } from '../execution/journal.ts';

export interface ExecutionDeps extends AuthDeps {
  workspaces: WorkspaceStore;
  projects: ProjectStore;
  versions: VersionStore;
  limits: ExecutionLimits;
  executions: ExecutionStore;
  steps: StepStore;
}

export function registerExecutionRoutes(router: Router, deps: ExecutionDeps): void {
  router.post('/api/projects/:id/execute', async (ctx: RouteContext) => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    const row = deps.projects.get(ctx.params.id);
    if (!row || !deps.workspaces.isMember(row.workspaceId, user.id)) throw notFound('Проект не найден');
    const live = deps.versions.findLive(ctx.params.id);
    if (!live) throw notFound('Проект ещё не опубликован — исполнять нечего');
    const liveDoc = deps.versions.get(ctx.params.id, live.id);
    if (!liveDoc) throw notFound('Опубликованная версия не найдена');

    // Полезная нагрузка: общий лимит тела уже применён в readJsonBody.
    const body = await readJsonBody(ctx.req, deps.config.maxBodyBytes);
    let payload: Record<string, unknown> = { source: 'generic' };
    if (body.payload !== undefined) {
      if (typeof body.payload !== 'object' || body.payload === null || Array.isArray(body.payload)) {
        throw badRequest('Поле "payload" должно быть объектом');
      }
      payload = { source: 'generic', ...body.payload };
      if (typeof payload.source !== 'string') throw badRequest('Поле "payload.source" должно быть строкой');
    }

    try {
      const result = await runTrackedExecution(
        { executions: deps.executions, steps: deps.steps },
        {
          workspaceId: row.workspaceId,
          projectId: row.id,
          projectVersionId: live.id,
          triggerType: 'api',
          triggerSource: 'rest',
          payload,
          limits: deps.limits,
        },
        liveDoc,
      );
      sendJson(ctx.res, 200, { result });
    } catch (err) {
      if (err instanceof ParallelLimitError) throw tooManyRequests(err.message);
      throw err;
    }
  });
}
