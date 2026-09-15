/**
 * Сквозная цепочка 5.8: обновление → сервер → ТОЛЬКО LIVE-версия →
 * рантайм → действие → мок-транспорт. Черновик не исполняется,
 * токен течёт только через Secrets Vault.
 */

import http, { type Server } from 'node:http';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import type { ServerConfig } from '../config.ts';
import { openDb, runMigrations, type Db } from '../db.ts';

const TOKEN_VALUE = '777:МокТокенТолькоДляТестов';

let db: Db;
let server: Server;
let baseUrl = '';
const answers: Array<{ callbackQueryId: string; text?: string; showAlert?: boolean }> = [];
const sent: Array<{ token: string; chatId: number | string; text: string }> = [];

const config: ServerConfig = {
  host: '127.0.0.1',
  port: 0,
  dbPath: ':memory:',
  env: 'development',
  repoRoot: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..'),
  maxBodyBytes: 64 * 1024,
  sessionSecret: 'test-secret-test-secret-test-secret-0123456789',
  sessionTtlDays: 1,
  execTimeoutMs: 5_000,
  execMaxParallel: 2,
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

const node = (id: string, blockId: string, configValues: Record<string, unknown> = {}) => ({
  id, blockId, position: { x: 0, y: 0 }, config: configValues,
});
const edge = (id: string, source: string, sourcePort: string, target: string, targetPort: string) => ({
  id, source, sourcePort, target, targetPort,
});

/** Триггер-сообщение + константный текст → отправка в чат из события. */
function replyDoc(constantText: string, id = 'proj-live-tg') {
  return {
    formatVersion: 1,
    id,
    name: 'Ответчик',
    kind: 'telegram',
    canvas: {
      id: `${id}:canvas`,
      name: 'Ответчик',
      nodes: [
        node('t', 'telegram.message_received'),
        node('c', 'core.text', { value: constantText }),
        node('s', 'telegram.send_message'),
      ],
      edges: [
        edge('e1', 'c', 'text', 's', 'text'),
        edge('e2', 't', 'chat_id', 's', 'chat_id'),
      ],
    },
    models: [],
    variables: [],
    meta: { createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001 },
  };
}

const update = (id: number, chatId: number) => ({
  update_id: id,
  message: { message_id: id, text: 'привет', from: { id: 7 }, chat: { id: chatId, type: 'private' } },
});

beforeEach(async () => {
  db = openDb(':memory:');
  runMigrations(db, path.join(config.repoRoot, 'server', 'migrations'));
  sent.length = 0;
  answers.length = 0;
  const app = createApp({
    config,
    db,
    version: '0.0.0-test',
    webhookLimiter: undefined,
    telegramTransportFor: (token: string) => ({
      getMe: async () => ({ id: 1 }),
      sendMessage: async ({ chatId, text }) => {
        sent.push({ token, chatId, text });
        return { messageId: 1 };
      },
      sendPhoto: async () => ({ messageId: 1 }),
      editMessageText: async () => true,
      deleteMessage: async () => true,
      answerCallbackQuery: async (params) => { answers.push(params); return true; },
      setWebhook: async () => true,
      getWebhookInfo: async () => ({ url: '', pendingUpdateCount: 0 }),
      deleteWebhook: async () => true,
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

async function setup(publish: boolean, doc = replyDoc('ЖИВОЙ ОТВЕТ')): Promise<{ cookie: string; projectId: string; webhookPath: string; workspaceId: string; secretId: string }> {
  const reg = await api('POST', '/api/auth/register', {
    email: `live-${Math.random().toString(36).slice(2)}@example.ru`,
    password: 'Пароль12345',
    name: 'Лайв',
  });
  const cookie = cookieOf(reg);
  const list = (await (await api('GET', '/api/workspaces', undefined, cookie)).json()) as {
    workspaces: Array<{ id: string }>;
  };
  const workspaceId = list.workspaces[0].id;
  const created = await api('POST', '/api/projects', { workspaceId, document: doc }, cookie);
  const { project } = (await created.json()) as { project: { id: string } };
  const secret = await api('POST', `/api/workspaces/${workspaceId}/secrets`, { name: 'TG', value: TOKEN_VALUE }, cookie);
  const { secret: secretMeta } = (await secret.json()) as { secret: { id: string } };
  if (publish) {
    const pub = await api('POST', `/api/projects/${project.id}/publish`, {}, cookie);
    expect(pub.status).toBe(201);
  }
  const bot = await api('POST', `/api/workspaces/${workspaceId}/telegram-bots`, { secretId: secretMeta.id, projectId: project.id }, cookie);
  const { bot: botMeta } = (await bot.json()) as { bot: { webhookPath: string } };
  return { cookie, projectId: project.id, webhookPath: botMeta.webhookPath, workspaceId, secretId: secretMeta.id };
}

describe('5.8D: LIVE-версия из обновления', () => {
  it('полная цепочка: обновление → LIVE → рантайм → мок-транспорт (токен из Vault)', async () => {
    const { webhookPath } = await setup(true);
    const res = await api('POST', `/api/telegram/webhook/${webhookPath}`, update(1, 42));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].chatId).toBe(42);
    expect(sent[0].text).toBe('ЖИВОЙ ОТВЕТ');
    expect(sent[0].token).toBe(TOKEN_VALUE); // токен пришёл расшифрованным из хранилища
    expect(JSON.stringify(sent)).not.toContain('undefined');
  });

  it('черновик не исполняется: правки после публикации не влияют', async () => {
    const { cookie, projectId, webhookPath } = await setup(true);
    await api('PUT', `/api/projects/${projectId}`, { document: replyDoc('ЧЕРНОВИК НЕ ДОЛЖЕН УЙТИ') }, cookie);
    await api('POST', `/api/telegram/webhook/${webhookPath}`, update(2, 77));
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe('ЖИВОЙ ОТВЕТ');
    expect(sent[0].text).not.toContain('ЧЕРНОВИК');
  });

  it('без публикации бот молчит', async () => {
    const { webhookPath } = await setup(false);
    const res = await api('POST', `/api/telegram/webhook/${webhookPath}`, update(3, 55));
    expect(res.status).toBe(200);
    expect(sent).toEqual([]);
  });

  it('бот без привязки к проекту не исполняет схемы', async () => {
    const reg = await api('POST', '/api/auth/register', { email: 'free@example.ru', password: 'Пароль12345', name: 'Б' });
    const cookie = cookieOf(reg);
    const list = (await (await api('GET', '/api/workspaces', undefined, cookie)).json()) as {
      workspaces: Array<{ id: string }>;
    };
    const secret = await api('POST', `/api/workspaces/${list.workspaces[0].id}/secrets`, { name: 'TG', value: TOKEN_VALUE }, cookie);
    const { secret: secretMeta } = (await secret.json()) as { secret: { id: string } };
    const bot = await api('POST', `/api/workspaces/${list.workspaces[0].id}/telegram-bots`, { secretId: secretMeta.id }, cookie);
    const { bot: botMeta } = (await bot.json()) as { bot: { webhookPath: string } };
    await api('POST', `/api/telegram/webhook/${botMeta.webhookPath}`, update(4, 1));
    expect(sent).toEqual([]);
  });

  it('удаление секрета каскадно отключает бота (вебхук гаснет)', async () => {
    const { cookie, webhookPath, workspaceId, secretId } = await setup(true);
    expect((await api('DELETE', `/api/workspaces/${workspaceId}/secrets/${secretId}`, undefined, cookie)).status).toBe(200);
    const res = await api('POST', `/api/telegram/webhook/${webhookPath}`, update(5, 9));
    expect(res.status).toBe(404); // бота больше нет
    expect(sent).toEqual([]);
  });
});


function callbackDoc() {
  const doc = replyDoc('Это сообщение не должно отправиться');
  doc.canvas.nodes.push(node('q', 'telegram.callback_query', { callbackDataFilter: 'confirm' }), node('a', 'telegram.answer_callback', { text: 'Подтверждено', show_alert: true }));
  doc.canvas.edges.push(edge('callback-id', 'q', 'callback_id', 'a', 'callback_id'));
  return doc;
}
const callbackUpdate = (data = 'confirm') => ({ update_id: 99, callback_query: {
  id: 'query-99', data, from: { id: 123 }, message: { message_id: 10, text: '/start', chat: { id: -77, type: 'group' } },
} });
it('09C1: callback → LIVE → outbox → answerCallbackQuery, не sendMessage; черновик не исполняется', async () => {
  const { webhookPath, projectId, cookie } = await setup(true, callbackDoc());
  await api('PUT', `/api/projects/${projectId}`, { document: replyDoc('Черновик') }, cookie);
  const res = await api('POST', `/api/telegram/webhook/${webhookPath}`, callbackUpdate());
  expect(res.status).toBe(200);
  expect(answers).toEqual([{ callbackQueryId: 'query-99', text: 'Подтверждено', showAlert: true }]);
  expect(sent).toEqual([]);
  expect(await res.text()).not.toContain(TOKEN_VALUE);
});
it('09C1: чужие данные и невалидный callback не создают исходящих действий', async () => {
  const { webhookPath } = await setup(true, callbackDoc());
  expect((await api('POST', `/api/telegram/webhook/${webhookPath}`, callbackUpdate('cancel'))).status).toBe(200);
  expect((await api('POST', `/api/telegram/webhook/${webhookPath}`, callbackUpdate('я'.repeat(33)))).status).toBe(400);
  expect(answers).toEqual([]);
  expect(sent).toEqual([]);
});
it('09C1: callback без LIVE не исполняет черновик', async () => {
  const { webhookPath } = await setup(false, callbackDoc());
  expect((await api('POST', `/api/telegram/webhook/${webhookPath}`, callbackUpdate())).status).toBe(200);
  expect(answers).toEqual([]);
  expect(sent).toEqual([]);
});
