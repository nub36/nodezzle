/**
 * Вебхук-слой Telegram (подэтап 5.8B).
 *
 * Эндпоинт без сессий (его вызывает Telegram), поэтому защита —
 * многослойная:
 *  - путь вебхука — случайные 32 байта (`webhook_path`);
 *  - ограничение частоты по «адрес + путь»;
 *  - общий лимит размера тела;
 *  - строгая валидация обновления схемой;
 *  - бот без привязки/по неверному пути — 404;
 *  - в журнал ничего не пишется (тело обновления не логируется).
 *
 * Исполнение схемы подключается в подэтапе 5.8D через `onUpdate`.
 */

import { sendJson, readJsonBody } from '../http.ts';
import { badRequest, notFound, tooManyRequests } from '../errors.ts';
import type { RouteContext, Router } from '../router.ts';
import type { ServerConfig } from '../config.ts';
import type { RateLimiter } from '../security/rate-limit.ts';
import type { TelegramBotMeta, TelegramBotStore } from '../telegram/bots.ts';
import { telegramUpdateSchema, updateToEvent, type TelegramEvent } from '../telegram/updates.ts';

export interface WebhookDeps {
  config: ServerConfig;
  bots: TelegramBotStore;
  limiter: RateLimiter;
  /** Обработчик нормализованного события (5.8D — запуск LIVE-версии). */
  onUpdate?: (bot: TelegramBotMeta, event: TelegramEvent) => Promise<void> | void;
}

export function registerWebhookRoutes(router: Router, deps: WebhookDeps): void {
  router.post('/api/telegram/webhook/:path', async (ctx: RouteContext) => {
    const remoteIp = ctx.req.socket?.remoteAddress ?? 'unknown';
    if (!deps.limiter.allow(`${remoteIp}:${ctx.params.path}`)) throw tooManyRequests();

    const bot = deps.bots.getByWebhookPath(ctx.params.path);
    if (!bot) throw notFound('Вебхук не найден');

    const body = await readJsonBody(ctx.req, deps.config.maxBodyBytes);
    const parsed = telegramUpdateSchema.safeParse(body);
    if (!parsed.success) throw badRequest('Некорректное обновление Telegram');

    const event = updateToEvent(parsed.data);
    if (event && deps.onUpdate) {
      // Ошибка обработки не должна вызывать повторные доставки
      // от Telegram: отвечаем 200, сведения об ошибке уйдут в
      // историю исполнения (подэтап 5.9).
      try {
        await deps.onUpdate(bot, event);
      } catch {
        // Намеренно тихо: секреты и содержимое обновлений не логируем.
      }
    }
    sendJson(ctx.res, 200, { ok: true });
  });
}
