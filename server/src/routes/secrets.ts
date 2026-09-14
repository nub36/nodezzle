/**
 * Секреты рабочего пространства: метаданные наружу, значения — никогда.
 * Ссылки из конфигураций блоков — только через `secret_id`.
 */

import { sendJson, readJsonBody } from '../http.ts';
import { badRequest, conflict, notFound, unauthorized } from '../errors.ts';
import { currentUser, type AuthDeps } from './auth.ts';
import type { RouteContext, Router } from '../router.ts';
import type { WorkspaceStore } from '../workspaces/store.ts';
import type { SecretStore } from '../secrets/store.ts';

export interface SecretDeps extends AuthDeps {
  workspaces: WorkspaceStore;
  secrets: SecretStore;
}

const NAME_MAX = 120;
const VALUE_MAX = 10_000;

export function registerSecretRoutes(router: Router, deps: SecretDeps): void {
  const requireWorkspace = (ctx: RouteContext): string => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    const workspace = deps.workspaces.get(ctx.params.id);
    if (!workspace || !deps.workspaces.isMember(workspace.id, user.id)) throw notFound('Рабочее пространство не найдено');
    return workspace.id;
  };

  router.get('/api/workspaces/:id/secrets', (ctx) => {
    const workspaceId = requireWorkspace(ctx);
    sendJson(ctx.res, 200, { secrets: deps.secrets.list(workspaceId) });
  });

  router.post('/api/workspaces/:id/secrets', async (ctx) => {
    const workspaceId = requireWorkspace(ctx);
    const user = currentUser(ctx, deps)!;
    const body = await readJsonBody(ctx.req, deps.config.maxBodyBytes);
    if (typeof body.name !== 'string' || body.name.trim() === '') throw badRequest('Поле "name" обязательно');
    if (typeof body.value !== 'string' || body.value.length === 0) throw badRequest('Поле "value" обязательно');
    const name = body.name.trim();
    if (name.length > NAME_MAX) throw badRequest(`Имя секрета длиннее ${NAME_MAX} символов`);
    if (body.value.length > VALUE_MAX) throw badRequest(`Значение секрета длиннее ${VALUE_MAX} символов`);
    try {
      const secret = deps.secrets.create(workspaceId, name, body.value);
      deps.audit.append({
        workspaceId,
        actorUserId: user.id,
        action: 'secret.create',
        targetType: 'secret',
        targetId: secret.id,
        metadata: { name },
      });
      // Отвечаем только метаданными: значение остаётся на сервере.
      sendJson(ctx.res, 201, { secret });
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE')) throw conflict('Секрет с таким именем уже существует');
      throw err;
    }
  });

  router.delete('/api/workspaces/:id/secrets/:secretId', (ctx) => {
    const workspaceId = requireWorkspace(ctx);
    const user = currentUser(ctx, deps)!;
    if (!deps.secrets.delete(workspaceId, ctx.params.secretId)) throw notFound('Секрет не найден');
    deps.audit.append({
      workspaceId,
      actorUserId: user.id,
      action: 'secret.delete',
      targetType: 'secret',
      targetId: ctx.params.secretId,
    });
    sendJson(ctx.res, 200, { ok: true });
  });
}
