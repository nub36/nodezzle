/** Конфигурация Telegram-ботов: токен только через секрет, наружу не уходит. */

import http, { type Server } from 'node:http';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import type { ServerConfig } from '../config.ts';
import { openDb, runMigrations, type Db } from '../db.ts';

const TOKEN_VALUE = '123456:ФиктивныйТокен-НЕ-коммитить';

let db: Db;
let server: Server;
let baseUrl = '';

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

async function api(method: string, url: string, body?: Record<string, unknown> | null, cookie?: string): Promise<Response> {
  return fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
  });
}

beforeEach(async () => {
  db = openDb(':memory:');
  runMigrations(db, path.join(config.repoRoot, 'server', 'migrations'));
  const app = createApp({ config, db, version: '0.0.0-test' });
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

function projectDocument(id: string) {
  return {
    formatVersion: 1,
    id,
    name: 'Бот-проект',
    kind: 'telegram',
    canvas: { id: `${id}:canvas`, name: 'Бот-проект', nodes: [], edges: [] },
    models: [],
    variables: [],
    meta: { createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001 },
  };
}

async function setup(email: string): Promise<{ cookie: string; workspaceId: string; projectId: string; secretId: string }> {
  const reg = await api('POST', '/api/auth/register', { email, password: 'Пароль12345', name: 'Владелец бота' });
  const cookie = cookieOf(reg);
  const list = (await (await api('GET', '/api/workspaces', undefined, cookie)).json()) as {
    workspaces: Array<{ id: string }>;
  };
  const workspaceId = list.workspaces[0].id;
  const created = await api('POST', '/api/projects', { workspaceId, document: projectDocument(`bot-proj-${email}`) }, cookie);
  const { project } = (await created.json()) as { project: { id: string } };
  const secret = await api('POST', `/api/workspaces/${workspaceId}/secrets`, { name: 'TG_BOT_TOKEN', value: TOKEN_VALUE }, cookie);
  const { secret: secretMeta } = (await secret.json()) as { secret: { id: string } };
  return { cookie, workspaceId, projectId: project.id, secretId: secretMeta.id };
}

describe('Конфигурация Telegram-ботов (5.8A)', () => {
  it('создаёт бота по секрету; токен ни в одном ответе не появляется', async () => {
    const { cookie, workspaceId, projectId, secretId } = await setup('bot1@example.ru');
    const res = await api('POST', `/api/workspaces/${workspaceId}/telegram-bots`, { secretId, projectId }, cookie);
    expect(res.status).toBe(201);
    const payload = (await res.json()) as { bot: { id: string; projectId: string; secretId: string; webhookPath: string; status: string } };
    expect(payload.bot.projectId).toBe(projectId);
    expect(payload.bot.secretId).toBe(secretId);
    expect(payload.bot.status).toBe('connected');
    expect(payload.bot.webhookPath).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(payload)).not.toContain('ФиктивныйТокен');

    const listed = await api('GET', `/api/workspaces/${workspaceId}/telegram-bots`, undefined, cookie);
    expect(JSON.stringify(await listed.json())).not.toContain('ФиктивныйТокен');
    const single = await api('GET', `/api/workspaces/${workspaceId}/telegram-bots/${payload.bot.id}`, undefined, cookie);
    expect(single.status).toBe(200);
  });

  it('чужой секрет использовать нельзя (404, существование не раскрывается)', async () => {
    const owner = await setup('bot2@example.ru');
    const stranger = await setup('bot3@example.ru');
    const res = await api('POST', `/api/workspaces/${owner.workspaceId}/telegram-bots`, { secretId: stranger.secretId }, stranger.cookie);
    expect(res.status).toBe(404);
    const res2 = await api('POST', `/api/workspaces/${owner.workspaceId}/telegram-bots`, { secretId: stranger.secretId }, owner.cookie);
    expect(res2.status).toBe(404);
  });

  it('один бот на проект: повторная привязка — 409; без секрета — 400', async () => {
    const { cookie, workspaceId, projectId, secretId } = await setup('bot4@example.ru');
    await api('POST', `/api/workspaces/${workspaceId}/telegram-bots`, { secretId, projectId }, cookie);
    const dup = await api('POST', `/api/workspaces/${workspaceId}/telegram-bots`, { secretId, projectId }, cookie);
    expect(dup.status).toBe(409);
    expect((await api('POST', `/api/workspaces/${workspaceId}/telegram-bots`, { projectId }, cookie)).status).toBe(400);
  });

  it('замена секрета и отвязка проекта через PATCH', async () => {
    const { cookie, workspaceId, projectId, secretId } = await setup('bot5@example.ru');
    const created = await api('POST', `/api/workspaces/${workspaceId}/telegram-bots`, { secretId, projectId }, cookie);
    const { bot } = (await created.json()) as { bot: { id: string } };

    const newSecret = await api('POST', `/api/workspaces/${workspaceId}/secrets`, { name: 'TG_BOT_TOKEN_NEW', value: TOKEN_VALUE }, cookie);
    const { secret: newSecretMeta } = (await newSecret.json()) as { secret: { id: string } };

    const patched = await api('PATCH', `/api/workspaces/${workspaceId}/telegram-bots/${bot.id}`, {
      secretId: newSecretMeta.id,
      projectId: null,
    }, cookie);
    expect(patched.status).toBe(200);
    const { bot: updated } = (await patched.json()) as { bot: { secretId: string; projectId: string | null } };
    expect(updated.secretId).toBe(newSecretMeta.id);
    expect(updated.projectId).toBeNull();
  });

  it('отключает бота; без сессии — 401; чужое пространство — 404', async () => {
    const { cookie, workspaceId, secretId } = await setup('bot6@example.ru');
    const created = await api('POST', `/api/workspaces/${workspaceId}/telegram-bots`, { secretId }, cookie);
    const { bot } = (await created.json()) as { bot: { id: string } };

    const stranger = await setup('bot7@example.ru');
    expect((await api('GET', `/api/workspaces/${workspaceId}/telegram-bots/${bot.id}`, undefined, stranger.cookie)).status).toBe(404);
    expect((await api('DELETE', `/api/workspaces/${workspaceId}/telegram-bots/${bot.id}`, null, stranger.cookie)).status).toBe(404);
    expect((await api('GET', `/api/workspaces/${workspaceId}/telegram-bots`)).status).toBe(401);

    expect((await api('DELETE', `/api/workspaces/${workspaceId}/telegram-bots/${bot.id}`, null, cookie)).status).toBe(200);
    const listed = (await (await api('GET', `/api/workspaces/${workspaceId}/telegram-bots`, undefined, cookie)).json()) as {
      bots: unknown[];
    };
    expect(listed.bots).toEqual([]);
  });
});
