/** Журнал исполнений: запись рантаймом, шаги, статусы, изоляция черновика. */

import http, { type Server } from 'node:http';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import type { ServerConfig } from '../config.ts';
import { openDb, runMigrations, type Db } from '../db.ts';
import { createExecutionStore, createStepStore, MAX_STEPS_PER_EXECUTION } from './journal.ts';

const TG_TOKEN = '555444333:AAEhBP0avF9YqQx6K3n1Q7u8Jv0w2X4y5zA';

let db: Db;
let server: Server;
let baseUrl = '';
const sent: Array<{ text: string }> = [];

const config: ServerConfig = {
  host: '127.0.0.1',
  port: 0,
  dbPath: ':memory:',
  env: 'development',
  repoRoot: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..'),
  maxBodyBytes: 64 * 1024,
  sessionSecret: 'test-secret-test-secret-test-secret-0123456789',
  sessionTtlDays: 1,
  execTimeoutMs: 300,
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

function replyDoc(text: string) {
  return {
    formatVersion: 1,
    id: 'proj-journal',
    name: 'Журнальная схема',
    kind: 'telegram',
    canvas: {
      id: 'proj-journal:canvas',
      name: 'Журнальная схема',
      nodes: [
        node('t', 'telegram.message_received'),
        node('c', 'core.text', { value: text }),
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

beforeEach(async () => {
  db = openDb(':memory:');
  runMigrations(db, path.join(config.repoRoot, 'server', 'migrations'));
  sent.length = 0;
  const app = createApp({
    config,
    db,
    version: '0.0.0-test',
    telegramTransportFor: () => ({
      getMe: async () => ({ id: 1 }),
      sendMessage: async ({ text }) => {
        sent.push({ text });
        return { messageId: 1 };
      },
      sendPhoto: async () => ({ messageId: 1 }),
      editMessageText: async () => true,
      deleteMessage: async () => true,
      answerCallbackQuery: async () => true,
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

describe('Хранилище исполнений', () => {
  function seed(): { workspaceId: string; projectId: string } {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      'u1', 'x@example.ru', 'h', 'X', now, now,
    );
    db.prepare('INSERT INTO workspaces (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
      'w1', 'u1', 'П', now, now,
    );
    db.prepare(
      'INSERT INTO projects (id, workspace_id, name, kind, format_version, document, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('p1', 'w1', 'П', 'telegram', 1, '{}', now, now);
    return { workspaceId: 'w1', projectId: 'p1' };
  }

  it('стартует и завершает исполнение с таймингами', () => {
    const { workspaceId, projectId } = seed();
    const executions = createExecutionStore(db);
    const record = executions.start({
      workspaceId,
      projectId,
      projectVersionId: null,
      triggerType: 'api',
      triggerSource: 'test',
    });
    expect(record.status).toBe('running');
    expect(record.startedAt).not.toBeNull();
    executions.finish(record.id, { status: 'error', errorCode: 'ERR_NODE_FAILED', durationMs: 12 });
    const fresh = executions.get(record.id)!;
    expect(fresh.status).toBe('error');
    expect(fresh.errorCode).toBe('ERR_NODE_FAILED');
    expect(fresh.finishedAt).not.toBeNull();
    expect(fresh.durationMs).toBe(12);
  });

  it('шаги нумеруются по порядку; лимит шагов соблюдается', () => {
    const { workspaceId, projectId } = seed();
    const executions = createExecutionStore(db);
    const steps = createStepStore(db);
    const execution = executions.start({
      workspaceId,
      projectId,
      projectVersionId: null,
      triggerType: 'api',
      triggerSource: 'test',
    });
    expect(
      steps.add(execution.id, { nodeId: 'a', blockType: 'core.text', status: 'success', startedAt: null, finishedAt: null, durationMs: 1, errorCode: null, inputSummary: '{}', outputSummary: '{}' }),
    ).toBe(true);
    expect(
      steps.add(execution.id, { nodeId: 'b', blockType: 'core.output', status: 'success', startedAt: null, finishedAt: null, durationMs: 1, errorCode: null, inputSummary: '{}', outputSummary: '{}' }),
    ).toBe(true);
    const list = steps.list(execution.id);
    expect(list.map((s) => s.sequence)).toEqual([1, 2]);
    expect(list[0].nodeId).toBe('a');

    for (let i = 2; i < MAX_STEPS_PER_EXECUTION; i += 1) {
      steps.add(execution.id, { nodeId: `n${i}`, blockType: 'core.text', status: 'success', startedAt: null, finishedAt: null, durationMs: 0, errorCode: null, inputSummary: null, outputSummary: null });
    }
    expect(
      steps.add(execution.id, { nodeId: 'overflow', blockType: 'core.text', status: 'success', startedAt: null, finishedAt: null, durationMs: 0, errorCode: null, inputSummary: null, outputSummary: null }),
    ).toBe(false);
  });
});

describe('Рантайм пишет журнал', () => {
  async function publishProject(docText = 'ОТВЕТ'): Promise<{ cookie: string; projectId: string; webhookPath: string }> {
    const reg = await api('POST', '/api/auth/register', {
      email: `j-${Math.random().toString(36).slice(2)}@example.ru`,
      password: 'Пароль12345',
      name: 'Ж',
    });
    const cookie = cookieOf(reg);
    const list = (await (await api('GET', '/api/workspaces', undefined, cookie)).json()) as {
      workspaces: Array<{ id: string }>;
    };
    const workspaceId = list.workspaces[0].id;
    const created = await api('POST', '/api/projects', { workspaceId, document: replyDoc(docText) }, cookie);
    const { project } = (await created.json()) as { project: { id: string } };
    const pub = await api('POST', `/api/projects/${project.id}/publish`, {}, cookie);
    expect(pub.status).toBe(201);
    const secret = await api('POST', `/api/workspaces/${workspaceId}/secrets`, { name: 'TG', value: TG_TOKEN }, cookie);
    const { secret: secretMeta } = (await secret.json()) as { secret: { id: string } };
    const bot = await api('POST', `/api/workspaces/${workspaceId}/telegram-bots`, { secretId: secretMeta.id, projectId: project.id }, cookie);
    const { bot: botMeta } = (await bot.json()) as { bot: { webhookPath: string } };
    return { cookie, projectId: project.id, webhookPath: botMeta.webhookPath };
  }

  it('ручной запуск создаёт исполнение и шаги в порядке выполнения', async () => {
    const { cookie, projectId } = await publishProject();
    const res = await api('POST', `/api/projects/${projectId}/execute`, { payload: { source: 'telegram', telegram: { text: 'привет', user_id: 1, chat_id: 42 } } }, cookie);
    expect(res.status).toBe(200);

    const execs = db.prepare('SELECT * FROM executions').all() as unknown as Array<{
      trigger_type: string;
      status: string;
      duration_ms: number | null;
    }>;
    expect(execs).toHaveLength(1);
    expect(execs[0].trigger_type).toBe('api');
    expect(execs[0].status).toBe('success');
    expect(execs[0].duration_ms).not.toBeNull();

    const steps = db.prepare('SELECT sequence, node_id, block_type, status FROM execution_steps ORDER BY sequence').all() as unknown as Array<{
      sequence: number;
      node_id: string;
      block_type: string;
      status: string;
    }>;
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps.map((s) => s.sequence)).toEqual(steps.map((_, i) => i + 1));
    expect(steps.some((s) => s.block_type === 'telegram.send_message' && s.status === 'success')).toBe(true);
  });

  it('таймаут фиксируется статусом «таймаут»', async () => {
    const { cookie, projectId } = await publishProject();
    // Задержка 1500 мс > лимита 300 мс в конфигурации теста.
    await api('PUT', `/api/projects/${projectId}`, {
      document: {
        ...replyDoc('ОТВЕТ'),
        canvas: {
          ...replyDoc('ОТВЕТ').canvas,
          nodes: [
            node('t', 'telegram.message_received'),
            node('d', 'flow.delay', { delayMs: 1500 }),
            node('s', 'telegram.send_message'),
          ],
          edges: [
            edge('e0', 't', 'text', 'd', 'value'),
            edge('e1', 'd', 'value', 's', 'text'),
            edge('e2', 't', 'chat_id', 's', 'chat_id'),
          ],
        },
      },
    }, cookie);
    // Исполняется ТОЛЬКО LIVE-версия — переопубликовываем с задержкой.
    const repub = await api('POST', `/api/projects/${projectId}/publish`, {}, cookie);
    expect(repub.status).toBe(201);
    const res = await api('POST', `/api/projects/${projectId}/execute`, { payload: { source: 'telegram', telegram: { text: 'ж', user_id: 1, chat_id: 42 } } }, cookie);
    expect(res.status).toBe(200);
    const execs = db.prepare('SELECT status FROM executions').all() as unknown as Array<{ status: string }>;
    expect(execs.map((e) => e.status)).toEqual(['timeout']);
  });

  it('обновление Telegram создаёт исполнение с источником и событием', async () => {
    const { webhookPath } = await publishProject();
    const res = await api('POST', `/api/telegram/webhook/${webhookPath}`, {
      update_id: 999,
      message: { message_id: 1, text: 'привет', from: { id: 7 }, chat: { id: 42, type: 'private' } },
    });
    expect(res.status).toBe(200);
    const execs = db.prepare('SELECT trigger_type, trigger_source, external_event_id, telegram_bot_id, status FROM executions').all() as unknown as Array<{
      trigger_type: string;
      trigger_source: string;
      external_event_id: string | null;
      telegram_bot_id: string | null;
      status: string;
    }>;
    expect(execs).toHaveLength(1);
    expect(execs[0].trigger_type).toBe('telegram');
    expect(execs[0].external_event_id).toBe('999');
    expect(execs[0].telegram_bot_id).not.toBeNull();
    expect(execs[0].status).toBe('success');
    expect(sent).toHaveLength(1);
  });

  it('неопубликованный проект: исполнения нет (черновик не исполняется)', async () => {
    const reg = await api('POST', '/api/auth/register', { email: 'nopub-j@example.ru', password: 'Пароль12345', name: 'Н' });
    const cookie = cookieOf(reg);
    const list = (await (await api('GET', '/api/workspaces', undefined, cookie)).json()) as {
      workspaces: Array<{ id: string }>;
    };
    const created = await api('POST', '/api/projects', { workspaceId: list.workspaces[0].id, document: replyDoc('X') }, cookie);
    const { project } = (await created.json()) as { project: { id: string } };
    await api('POST', `/api/projects/${project.id}/execute`, { payload: {} }, cookie);
    const count = db.prepare('SELECT COUNT(*) AS n FROM executions').get() as unknown as { n: number };
    expect(count.n).toBe(0);
  });

  it('сводки шагов не содержат токен, даже если он прошёл через схему', async () => {
    const { cookie, projectId } = await publishProject(TG_TOKEN);
    await api('POST', `/api/projects/${projectId}/execute`, { payload: { source: 'telegram', telegram: { text: 'привет', user_id: 1, chat_id: 42 } } }, cookie);
    const summaries = db.prepare('SELECT input_summary, output_summary FROM execution_steps').all() as unknown as Array<{
      input_summary: string | null;
      output_summary: string | null;
    }>;
    const all = summaries.map((s) => `${s.input_summary ?? ''}${s.output_summary ?? ''}`).join('\n');
    expect(all).not.toContain(TG_TOKEN);
    expect(all).toContain('[СКРЫТО]');
  });
});
