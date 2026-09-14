/** Управление вебхуком: только публичный HTTPS, только мок-транспорт. */

import http, { type Server } from 'node:http';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import type { ServerConfig } from '../config.ts';
import { openDb, runMigrations, type Db } from '../db.ts';
import { validatePublicUrl, buildWebhookUrl } from '../telegram/webhook-manage.ts';
import { ApiError } from '../errors.ts';

const TOKEN_VALUE = '888:МокТокенВебхука';

let db: Db;
let server: Server;
let baseUrl = '';
const transportCalls: Array<{ method: string; args: Record<string, unknown> }> = [];

const config: ServerConfig = {
  host: '127.0.0.1',
  port: 0,
  dbPath: ':memory:',
  env: 'development',
  repoRoot: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..'),
  maxBodyBytes: 64 * 1024,
  sessionSecret: 'test-secret-test-secret-test-secret-0123456789',
  sessionTtlDays: 1,
};

function cookieOf(res: Response): string {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.find((c) => c.startsWith('nodezzle_session=')) ?? '';
}

async function api(method: string, url: string, body?: Record<string, unknown>, cookie?: string): Promise<Response> {
  return fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(async () => {
  db = openDb(':memory:');
  runMigrations(db, path.join(config.repoRoot, 'server', 'migrations'));
  transportCalls.length = 0;
  const app = createApp({
    config,
    db,
    version: '0.0.0-test',
    telegramTransportFor: () => ({
      getMe: async () => ({ id: 1, username: 'mock_bot' }),
      sendMessage: async () => ({ messageId: 1 }),
      sendPhoto: async () => ({ messageId: 1 }),
      editMessageText: async () => true,
      deleteMessage: async () => true,
      answerCallbackQuery: async () => true,
      setWebhook: async ({ url, secretToken }) => {
        transportCalls.push({ method: 'setWebhook', args: { url, secretToken } });
        return true;
      },
      getWebhookInfo: async () => {
        const last = transportCalls.filter((c) => c.method === 'setWebhook').at(-1);
        return { url: (last?.args.url as string) ?? '', pendingUpdateCount: 3 };
      },
      deleteWebhook: async () => {
        transportCalls.push({ method: 'deleteWebhook', args: {} });
        return true;
      },
    }),
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

async function setup(): Promise<{ cookie: string; workspaceId: string; botId: string; webhookPath: string }> {
  const reg = await api('POST', '/api/auth/register', {
    email: `wh-${Math.random().toString(36).slice(2)}@example.ru`,
    password: 'Пароль12345',
    name: 'Вебхук-менеджер',
  });
  const cookie = cookieOf(reg);
  const list = (await (await api('GET', '/api/workspaces', undefined, cookie)).json()) as {
    workspaces: Array<{ id: string }>;
  };
  const workspaceId = list.workspaces[0].id;
  const secret = await api('POST', `/api/workspaces/${workspaceId}/secrets`, { name: 'TG', value: TOKEN_VALUE }, cookie);
  const { secret: meta } = (await secret.json()) as { secret: { id: string } };
  const bot = await api('POST', `/api/workspaces/${workspaceId}/telegram-bots`, { secretId: meta.id }, cookie);
  const { bot: botMeta } = (await bot.json()) as { bot: { id: string; webhookPath: string } };
  return { cookie, workspaceId, botId: botMeta.id, webhookPath: botMeta.webhookPath };
}

describe('validatePublicUrl', () => {
  it('принимает только публичный HTTPS без учётных данных', () => {
    expect(validatePublicUrl('https://nodezzle.example.org')).toBe('https://nodezzle.example.org');
    expect(validatePublicUrl('https://nodezzle.example.org/')).toBe('https://nodezzle.example.org');
    for (const bad of [
      'http://nodezzle.example.org',
      'https://localhost:8443',
      'https://127.0.0.1:8443',
      'https://10.1.2.3',
      'https://user:pass@nodezzle.example.org',
      'не адрес',
      '',
    ]) {
      expect(() => validatePublicUrl(bad)).toThrow(ApiError);
    }
  });

  it('адрес вебхука собирается из публичного корня и секретного пути', () => {
    expect(buildWebhookUrl('https://a.example', 'abc')).toBe('https://a.example/api/telegram/webhook/abc');
  });
});

describe('Управление вебхуком через АПИ (5.8F)', () => {
  it('регистрирует вебхук: публичный HTTPS + секретный заголовок из пути', async () => {
    const { cookie, workspaceId, botId, webhookPath } = await setup();
    const res = await api(
      'POST',
      `/api/workspaces/${workspaceId}/telegram-bots/${botId}/webhook`,
      { publicUrl: 'https://nodezzle.example.org' },
      cookie,
    );
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { url: string };
    expect(payload.url).toBe(`https://nodezzle.example.org/api/telegram/webhook/${webhookPath}`);
    expect(transportCalls[0]).toMatchObject({
      method: 'setWebhook',
      args: { url: payload.url, secretToken: webhookPath },
    });
  });

  it('отклоняет локальные/незащищённые адреса БЕЗ обращения к транспорту', async () => {
    const { cookie, workspaceId, botId } = await setup();
    for (const publicUrl of ['http://nodezzle.example.org', 'https://127.0.0.1:4210', 'https://localhost']) {
      const res = await api('POST', `/api/workspaces/${workspaceId}/telegram-bots/${botId}/webhook`, { publicUrl }, cookie);
      expect(res.status).toBe(400);
    }
    expect(transportCalls.filter((c) => c.method === 'setWebhook')).toEqual([]);
  });

  it('проверка вебхука возвращает статус; удаление вызывает deleteWebhook', async () => {
    const { cookie, workspaceId, botId } = await setup();
    await api('POST', `/api/workspaces/${workspaceId}/telegram-bots/${botId}/webhook`, { publicUrl: 'https://n.example' }, cookie);
    const info = await api('GET', `/api/workspaces/${workspaceId}/telegram-bots/${botId}/webhook`, undefined, cookie);
    expect(info.status).toBe(200);
    const payload = (await info.json()) as { configured: boolean; pendingUpdateCount: number };
    expect(payload.configured).toBe(true);
    expect(payload.pendingUpdateCount).toBe(3);

    expect((await api('DELETE', `/api/workspaces/${workspaceId}/telegram-bots/${botId}/webhook`, undefined, cookie)).status).toBe(200);
    expect(transportCalls.some((c) => c.method === 'deleteWebhook')).toBe(true);
  });

  it('чужой бот — 404; без сессии — 401', async () => {
    const owner = await setup();
    const stranger = await setup();
    expect(
      (await api('POST', `/api/workspaces/${owner.workspaceId}/telegram-bots/${owner.botId}/webhook`, { publicUrl: 'https://x.example' }, stranger.cookie)).status,
    ).toBe(404);
    expect((await api('GET', `/api/workspaces/${owner.workspaceId}/telegram-bots/${owner.botId}/webhook`)).status).toBe(401);
  });
});
