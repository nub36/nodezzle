/**
 * Маршруты рабочих пространств. Доступ — только для участников,
 * проверка выполняется сервером.
 */

import { badRequest, notFound, unauthorized } from '../errors.ts';
import { readJsonBody, sendJson } from '../http.ts';
import type { RouteContext, Router } from '../router.ts';
import type { WorkspaceStore } from '../workspaces/store.ts';
import { currentUser, type AuthDeps } from './auth.ts';

const NAME_MAX = 120;

export interface WorkspaceDeps extends AuthDeps {
  workspaces: WorkspaceStore;
}

export function registerWorkspaceRoutes(router: Router, deps: WorkspaceDeps): void {
  router.post('/api/workspaces', async (ctx) => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    const { req, res } = ctx;
    const body = await readJsonBody(req, deps.config.maxBodyBytes);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name === '' || name.length > NAME_MAX) {
      throw badRequest(`Укажите название рабочего пространства (до ${NAME_MAX} символов)`);
    }
    const ws = deps.workspaces.create(user.id, name);
    sendJson(res, 201, { workspace: ws });
  });

  router.get('/api/workspaces', (ctx) => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    sendJson(ctx.res, 200, { workspaces: deps.workspaces.listForUser(user.id) });
  });
}

/** Общая проверка: пользователь должен быть участником пространства. */
export function requireMembership(deps: WorkspaceDeps, ctx: RouteContext, wsId: string): string {
  const user = currentUser(ctx, deps);
  if (!user) throw unauthorized();
  if (!deps.workspaces.isMember(wsId, user.id)) throw notFound('Рабочее пространство не найдено');
  return user.id;
}
