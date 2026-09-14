/**
 * Конфигурация Telegram-ботов через АПИ (подэтап 5.8A).
 *
 * Токен бота вносится владельцем как секрет рабочего пространства и
 * привязывается к боту только по `secret_id`. Значение токена не
 * возвращается ни в одном ответе.
 */

import { sendJson, readJsonBody } from '../http.ts';
import { badRequest, conflict, notFound, unauthorized } from '../errors.ts';
import { currentUser, type AuthDeps } from './auth.ts';
import type { RouteContext, Router } from '../router.ts';
import type { WorkspaceStore } from '../workspaces/store.ts';
import type { ProjectStore } from '../projects/store.ts';
import type { SecretStore } from '../secrets/store.ts';
import type { TelegramBotStore } from '../telegram/bots.ts';

export interface BotDeps extends AuthDeps {
  workspaces: WorkspaceStore;
  projects: ProjectStore;
  secrets: SecretStore;
  bots: TelegramBotStore;
}

export function registerTelegramBotRoutes(router: Router, deps: BotDeps): void {
  const requireWorkspace = (ctx: RouteContext): string => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    const workspace = deps.workspaces.get(ctx.params.id);
    if (!workspace || !deps.workspaces.isMember(workspace.id, user.id)) {
      throw notFound('Рабочее пространство не найдено');
    }
    return workspace.id;
  };

  const requireBot = (ctx: RouteContext) => {
    const workspaceId = requireWorkspace(ctx);
    const bot = deps.bots.get(workspaceId, ctx.params.botId);
    if (!bot) throw notFound('Бот не найден');
    return { workspaceId, bot };
  };

  /** secretId обязан принадлежать ЭТОМУ пространству (чужие секреты — 404). */
  const resolveSecret = (workspaceId: string, secretId: unknown): string => {
    if (typeof secretId !== 'string' || secretId === '') throw badRequest('Поле "secretId" обязательно');
    const secret = deps.secrets.meta(workspaceId, secretId);
    if (!secret) throw notFound('Секрет не найден в рабочем пространстве');
    return secret.id;
  };

  /** projectId (если задан) обязан существовать в ЭТОМ пространстве. */
  const resolveProject = (workspaceId: string, projectId: unknown): string | null => {
    if (projectId === undefined || projectId === null) return null;
    if (typeof projectId !== 'string' || projectId === '') throw badRequest('Поле "projectId" должно быть строкой');
    const project = deps.projects.get(projectId);
    if (!project || project.workspaceId !== workspaceId) throw notFound('Проект не найден в рабочем пространстве');
    return project.id;
  };

  const assertUniqueBinding = (workspaceId: string, projectId: string | null, exceptBotId?: string): void => {
    if (projectId === null) return;
    const existing = deps.bots.list(workspaceId).find((b) => b.projectId === projectId && b.id !== exceptBotId);
    if (existing) throw conflict('К этому проекту уже подключён бот');
  };

  router.post('/api/workspaces/:id/telegram-bots', async (ctx) => {
    const workspaceId = requireWorkspace(ctx);
    const body = await readJsonBody(ctx.req, deps.config.maxBodyBytes);
    const secretId = resolveSecret(workspaceId, body.secretId);
    const projectId = resolveProject(workspaceId, body.projectId);
    assertUniqueBinding(workspaceId, projectId);
    const bot = deps.bots.create(workspaceId, secretId, projectId);
    sendJson(ctx.res, 201, { bot });
  });

  router.get('/api/workspaces/:id/telegram-bots', (ctx) => {
    const workspaceId = requireWorkspace(ctx);
    sendJson(ctx.res, 200, { bots: deps.bots.list(workspaceId) });
  });

  router.get('/api/workspaces/:id/telegram-bots/:botId', (ctx) => {
    const { bot } = requireBot(ctx);
    sendJson(ctx.res, 200, { bot });
  });

  router.patch('/api/workspaces/:id/telegram-bots/:botId', async (ctx) => {
    const { workspaceId, bot } = requireBot(ctx);
    const body = await readJsonBody(ctx.req, deps.config.maxBodyBytes);
    const patch: { projectId?: string | null; secretId?: string } = {};
    if ('secretId' in body) patch.secretId = resolveSecret(workspaceId, body.secretId);
    if ('projectId' in body) {
      patch.projectId = resolveProject(workspaceId, body.projectId);
      assertUniqueBinding(workspaceId, patch.projectId, bot.id);
    }
    const updated = deps.bots.update(workspaceId, bot.id, patch);
    sendJson(ctx.res, 200, { bot: updated });
  });

  router.delete('/api/workspaces/:id/telegram-bots/:botId', (ctx) => {
    const { workspaceId, bot } = requireBot(ctx);
    deps.bots.delete(workspaceId, bot.id);
    sendJson(ctx.res, 200, { ok: true });
  });
}
