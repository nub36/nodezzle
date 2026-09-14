/** Вебхук-слой: путь, валидация, лимиты, нормализация — без токенов и сети. */

import http, { type Server } from 'node:http';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import type { ServerConfig } from '../config.ts';
import { openDb, runMigrations, type Db } from '../db.ts';
import { createRateLimiter } from '../security/rate-limit.ts';
import type { TelegramBotMeta } from '../telegram/bots.ts';
import type { TelegramEvent } from '../telegram/updates.ts';

let db: Db;
let server: Server;
let baseUrl = '';
const events: Array<{ botId: string; event: TelegramEvent }> = [];

const config: ServerConfig = {
  host: '127.0.0.1',
  port: 0,
  dbPath: ':memory:',
  env: 'development',
  repoRoot: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..'),
  maxBodyBytes: 16 * 1024,
  sessionSecret: 'test-secret-test-secret-test-secret-0123456789',
  sessionTtlDays: 1,
};

function cookieOf(res: Response): string {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.find((c) => c.startsWith('nodezzle_session=')) ?? '';
}

async function api(method: string, url: string, body?: unknown, cookie?: string): Promise<Response> {
  return fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
}

beforeEach(async () => {
  db = openDb(':memory:');
  runMigrations(db, path.join(config.repoRoot, 'server', 'migrations'));
  events.length = 0;
  const app = createApp({
    config,
    db,
    version: '0.0.0-test',
    // Маленький лимит — проверить защиту частоты.
    webhookLimiter: createRateLimiter(3, 60_000),
    onTelegramUpdate: (bot: TelegramBotMeta, event: TelegramEvent) => {
      events.push({ botId: bot.id, event });
    },
  });
  server = http.createServer(app.handle);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('нет адреса слушателя');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  db.close();
});

async function createBot(): Promise<{ cookie: string; webhookPath: string }> {
  const reg = await api('POST', '/api/auth/register', { email: 'hook@example.ru', password: 'Пароль12345', name: 'Вебхук' });
  const cookie = cookieOf(reg);
  const list = (await (await api('GET', '/api/workspaces', undefined, cookie)).json()) as {
    workspaces: Array<{ id: string }>;
  };
  const workspaceId = list.workspaces[0].id;
  const secret = await api('POST', `/api/workspaces/${workspaceId}/secrets`, { name: 'TG_TOKEN', value: '999:ТокенНеПоказывать' }, cookie);
  const { secret: meta } = (await secret.json()) as { secret: { id: string } };
  const bot = await api('POST', `/api/workspaces/${workspaceId}/telegram-bots`, { secretId: meta.id }, cookie);
  const { bot: botMeta } = (await bot.json()) as { bot: { webhookPath: string } };
  return { cookie, webhookPath: botMeta.webhookPath };
}

const update = (id: number, text: string) => ({
  update_id: id,
  message: {
    message_id: id,
    text,
    from: { id: 77, username: 'tester' },
    chat: { id: 555, type: 'private' },
  },
});

describe('Вебхук-слой Telegram (5.8B)', () => {
  it('принимает обновление по секретному пути и вызывает обработчик нормализованным событием', async () => {
    const { webhookPath } = await createBot();
    const res = await api('POST', `/api/telegram/webhook/${webhookPath}`, update(1, '/start'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(events).toHaveLength(1);
    expect(events[0].event.payload.telegram).toMatchObject({ text: '/start', command: 'start', chat_id: 555, user_id: 77 });
  });

  it('неверный путь — 404', async () => {
    await createBot();
    expect((await api('POST', '/api/telegram/webhook/неверный-путь', update(2, 'привет'))).status).toBe(404);
    expect(events).toHaveLength(0);
  });

  it('невалидное обновление — 400, обработчик не вызывается', async () => {
    const { webhookPath } = await createBot();
    expect((await api('POST', `/api/telegram/webhook/${webhookPath}`, { update_id: 'не число' })).status).toBe(400);
    expect((await api('POST', `/api/telegram/webhook/${webhookPath}`, { message: {} })).status).toBe(400);
    expect(events).toHaveLength(0);
  });

  it('тело больше лимита — 413', async () => {
    const { webhookPath } = await createBot();
    const huge = { update_id: 3, message: { message_id: 3, text: 'x'.repeat(4096), chat: { id: 1, type: 'p' } } };
    // Раздуваем полезную нагрузку мусорным полем за пределами 16 КБ.
    (huge as Record<string, unknown>).junk = 'y'.repeat(20 * 1024);
    const res = await api('POST', `/api/telegram/webhook/${webhookPath}`, huge);
    expect(res.status).toBe(413);
  });

  it('превышение частоты — 429', async () => {
    const { webhookPath } = await createBot();
    const statuses = [
      (await api('POST', `/api/telegram/webhook/${webhookPath}`, update(10, 'а'))).status,
      (await api('POST', `/api/telegram/webhook/${webhookPath}`, update(11, 'б'))).status,
      (await api('POST', `/api/telegram/webhook/${webhookPath}`, update(12, 'в'))).status,
      (await api('POST', `/api/telegram/webhook/${webhookPath}`, update(13, 'г'))).status,
    ];
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);
  });

  it('ошибка обработчика не ломает ответ (нет повторных доставок)', async () => {
    const { webhookPath } = await createBot();
    // Отдельное приложение с падающим обработчиком (та же БД).
    const failingApp = createApp({
      config,
      db,
      version: '0.0.0-test',
      webhookLimiter: createRateLimiter(100, 60_000),
      onTelegramUpdate: () => {
        throw new Error('сбой исполнения');
      },
    });
    const failingServer = http.createServer(failingApp.handle);
    await new Promise<void>((resolve) => failingServer.listen(0, '127.0.0.1', resolve));
    const addr = failingServer.address();
    if (addr === null || typeof addr === 'string') throw new Error('нет адреса слушателя');
    const res = await fetch(`http://127.0.0.1:${addr.port}/api/telegram/webhook/${webhookPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(update(20, 'привет')),
    });
    expect(res.status).toBe(200);
    await new Promise<void>((resolve, reject) => failingServer.close((e) => (e ? reject(e) : resolve())));
  });
});
