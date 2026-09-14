/**
 * Приложение сервера: маршрутизатор + централизованная обработка ошибок.
 * Вынесено отдельно от `index.ts`, чтобы тесты могли поднимать приложение
 * без реального слушателя порта.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServerConfig } from './config.ts';
import { sendError, notFound, ApiError } from './errors.ts';
import { sendJson } from './http.ts';
import { Router } from './router.ts';
import type { Db } from './db.ts';
import { createAuthStore } from './auth/store.ts';
import { createRateLimiter } from './security/rate-limit.ts';
import { registerAuthRoutes } from './routes/auth.ts';

/** Лимит попыток входа/регистрации с одного адреса. */
const AUTH_LIMIT_PER_WINDOW = 20;
const AUTH_WINDOW_MS = 10 * 60 * 1000;

export interface AppDeps {
  config: ServerConfig;
  db: Db;
  /** Версия продукта (из package.json). */
  version: string;
}

export interface App {
  router: Router;
  handle: (req: IncomingMessage, res: ServerResponse) => void;
}

export function createApp(deps: AppDeps): App {
  const router = new Router();

  router.get('/api/health', ({ res }) => {
    sendJson(res, 200, {
      status: 'ok',
      service: 'nodezzle-api',
      version: deps.version,
      env: deps.config.env,
      time: new Date().toISOString(),
    });
  });

  registerAuthRoutes(router, {
    config: deps.config,
    store: createAuthStore(deps.db),
    authLimiter: createRateLimiter(AUTH_LIMIT_PER_WINDOW, AUTH_WINDOW_MS),
  });

  const handle = (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    void (async () => {
      const matched = router.match(req.method ?? 'GET', pathname);
      if (matched === null) throw notFound('Маршрут не найден');
      if (matched === 'method_not_allowed') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Метод не разрешён');
      await matched.handler({ params: matched.params, req, res });
    })().catch((err: unknown) => sendError(res, err));
  };

  return { router, handle };
}
