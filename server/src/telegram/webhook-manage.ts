/**
 * Управление вебхуком бота (подэтап 5.8F) — безопасные операции.
 *
 * Регистрация вебхука в Telegram выполняется ТОЛЬКО при выполнении
 * двух условий: есть реальный токен (в Secrets Vault) и владельцем
 * указан публичный HTTPS-адрес. Локальная разработка работает без
 * вебхука (обновления можно слать на локальный эндпоинт вручную).
 */

import { sendJson, readJsonBody } from '../http.ts';
import { badRequest, forbidden, notFound, unauthorized } from '../errors.ts';
import { currentUser, type AuthDeps } from '../routes/auth.ts';
import type { RouteContext, Router } from '../router.ts';
import type { WorkspaceStore } from '../workspaces/store.ts';
import type { SecretStore } from '../secrets/store.ts';
import type { TelegramBotMeta, TelegramBotStore } from './bots.ts';
import { createTelegramApi, type TelegramTransport } from './api.ts';
import type { AuditStore } from '../audit/store.ts';

/** Запретные адреса: локальные и служебные — вебхук обязан быть публичным. */
const FORBIDDEN_HOSTS = /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|\[::1?\])/i;

export function validatePublicUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') throw badRequest('Укажите публичный адрес сервера (publicUrl)');
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw badRequest('publicUrl не является корректным адресом');
  }
  if (url.protocol !== 'https:') throw badRequest('Вебхук Telegram принимает только публичный HTTPS-адрес');
  if (url.username || url.password) throw badRequest('Адрес не должен содержать учётные данные');
  if (FORBIDDEN_HOSTS.test(url.hostname)) throw badRequest('Локальные и служебные адреса для вебхука не принимаются');
  return `${url.origin}`.replace(/\/+$/, '');
}

export function buildWebhookUrl(publicOrigin: string, webhookPath: string): string {
  return `${publicOrigin}/api/telegram/webhook/${webhookPath}`;
}

export interface WebhookManageDeps extends AuthDeps {
  workspaces: WorkspaceStore;
  secrets: SecretStore;
  bots: TelegramBotStore;
  audit: AuditStore;
  /** Фабрика транспорта; в тестах — только мок. */
  transportFor?: (token: string) => TelegramTransport;
}

export function registerWebhookManageRoutes(router: Router, deps: WebhookManageDeps): void {
  const transportFor = deps.transportFor ?? ((token: string) => createTelegramApi({ token }));

  const requireBot = (ctx: RouteContext): { bot: TelegramBotMeta; token: string } => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    const workspace = deps.workspaces.get(ctx.params.id);
    if (!workspace || !deps.workspaces.isMember(workspace.id, user.id)) {
      throw notFound('Рабочее пространство не найдено');
    }
    const bot = deps.bots.get(workspace.id, ctx.params.botId);
    if (!bot) throw notFound('Бот не найден');
    const token = deps.secrets.decrypt(workspace.id, bot.secretId);
    if (!token) throw forbidden('Секрет бота отсутствует — токен недоступен');
    return { bot, token };
  };

  // Зарегистрировать вебхук.
  router.post('/api/workspaces/:id/telegram-bots/:botId/webhook', async (ctx) => {
    const { bot, token } = requireBot(ctx);
    const body = await readJsonBody(ctx.req, deps.config.maxBodyBytes);
    const origin = validatePublicUrl(body.publicUrl);
    const url = buildWebhookUrl(origin, bot.webhookPath);
    const transport = transportFor(token);
    // Секрет пути одновременно служит секретным заголовком вебхука.
    await transport.setWebhook({ url, secretToken: bot.webhookPath });
    deps.audit.append({
      workspaceId: ctx.params.id,
      actorUserId: currentUser(ctx, deps)!.id,
      action: 'telegram.webhook_register',
      targetType: 'telegram_bot',
      targetId: bot.id,
      // Путь вебхука не логируем — это секрет.
      metadata: { origin },
    });
    sendJson(ctx.res, 200, { ok: true, url });
  });

  // Проверить вебхук (статус в Telegram + ожидаемый адрес).
  router.get('/api/workspaces/:id/telegram-bots/:botId/webhook', async (ctx) => {
    const { bot, token } = requireBot(ctx);
    const transport = transportFor(token);
    const info = await transport.getWebhookInfo();
    const expected = info.url; // фактический адрес, известный Telegram
    sendJson(ctx.res, 200, {
      configured: expected !== '',
      remoteUrl: expected,
      pendingUpdateCount: info.pendingUpdateCount,
      expectedPath: `/api/telegram/webhook/${bot.webhookPath}`,
    });
  });

  // Удалить вебхук.
  router.delete('/api/workspaces/:id/telegram-bots/:botId/webhook', async (ctx) => {
    const { bot, token } = requireBot(ctx);
    const transport = transportFor(token);
    await transport.deleteWebhook();
    deps.audit.append({
      workspaceId: ctx.params.id,
      actorUserId: currentUser(ctx, deps)!.id,
      action: 'telegram.webhook_delete',
      targetType: 'telegram_bot',
      targetId: bot.id,
    });
    sendJson(ctx.res, 200, { ok: true });
  });
}
