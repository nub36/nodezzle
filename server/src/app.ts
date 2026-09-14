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
import { createWorkspaceStore } from './workspaces/store.ts';
import { createProjectStore } from './projects/store.ts';
import { createVersionStore } from './projects/versions.ts';
import { createSecretStore } from './secrets/store.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerWorkspaceRoutes } from './routes/workspaces.ts';
import { registerProjectRoutes } from './routes/projects.ts';
import { registerSecretRoutes } from './routes/secrets.ts';
import { registerExecutionRoutes } from './routes/execution.ts';
import { createTelegramBotStore } from './telegram/bots.ts';
import { registerTelegramBotRoutes } from './routes/telegram-bots.ts';
import { registerWebhookRoutes } from './routes/webhook.ts';
import type { RateLimiter } from './security/rate-limit.ts';
import type { TelegramBotMeta } from './telegram/bots.ts';
import type { TelegramEvent } from './telegram/updates.ts';

/** Лимит попыток входа/регистрации с одного адреса. */
const AUTH_LIMIT_PER_WINDOW = 20;
const AUTH_WINDOW_MS = 10 * 60 * 1000;

/** Лимит обновлений вебхука: с одного адреса на один путь. */
const WEBHOOK_LIMIT_PER_WINDOW = 120;
const WEBHOOK_WINDOW_MS = 60 * 1000;

export interface AppDeps {
  config: ServerConfig;
  db: Db;
  /** Версия продукта (из package.json). */
  version: string;
  /** Подмена ограничителя вебхука (тесты). */
  webhookLimiter?: RateLimiter;
  /** Обработчик входящего обновления вебхука (5.8D подключает исполнение). */
  onTelegramUpdate?: (bot: TelegramBotMeta, event: TelegramEvent) => Promise<void> | void;
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

  const workspaces = createWorkspaceStore(deps.db);
  const projects = createProjectStore(deps.db);
  const versions = createVersionStore(deps.db);
  const secrets = createSecretStore(deps.db, deps.config);
  const bots = createTelegramBotStore(deps.db);
  const authDeps = {
    config: deps.config,
    store: createAuthStore(deps.db),
    authLimiter: createRateLimiter(AUTH_LIMIT_PER_WINDOW, AUTH_WINDOW_MS),
    workspaces,
  };
  registerAuthRoutes(router, authDeps);
  registerWorkspaceRoutes(router, { ...authDeps, workspaces });
  registerProjectRoutes(router, { ...authDeps, workspaces, projects, versions });
  registerSecretRoutes(router, { ...authDeps, workspaces, secrets });
  registerTelegramBotRoutes(router, { ...authDeps, workspaces, projects, secrets, bots });
  registerWebhookRoutes(router, {
    config: deps.config,
    bots,
    limiter: deps.webhookLimiter ?? createRateLimiter(WEBHOOK_LIMIT_PER_WINDOW, WEBHOOK_WINDOW_MS),
    onUpdate: deps.onTelegramUpdate,
  });
  registerExecutionRoutes(router, {
    ...authDeps,
    workspaces,
    projects,
    versions,
    limits: {
      timeoutMs: deps.config.execTimeoutMs ?? 10_000,
      maxParallel: deps.config.execMaxParallel ?? 2,
    },
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
