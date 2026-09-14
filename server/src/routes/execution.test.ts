/** Исполнение опубликованной схемы на сервере: лимиты и неизменяемость. */

import http, { type Server } from 'node:http';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import type { ServerConfig } from '../config.ts';
import { openDb, runMigrations, type Db } from '../db.ts';
import type { NodezzleProject } from '../../../src/core/project/schema.ts';

let db: Db;
let server: Server;
let baseUrl = '';

// Жёсткие лимиты: короткий таймаут, одно параллельное исполнение.
const config: ServerConfig = {
  host: '127.0.0.1',
  port: 0,
  dbPath: ':memory:',
  env: 'development',
  repoRoot: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..'),
  maxBodyBytes: 64 * 1024,
  sessionSecret: 'test-secret-test-secret-test-secret-0123456789',
  sessionTtlDays: 1,
  execTimeoutMs: 250,
  execMaxParallel: 1,
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
  id,
  blockId,
  position: { x: 0, y: 0 },
  config: configValues,
});

const edge = (id: string, source: string, sourcePort: string, target: string, targetPort: string) => ({
  id,
  source,
  sourcePort,
  target,
  targetPort,
});

/** Триггер → задержка → отправка сообщения в Telegram. */
function pipelineDoc(delayMs: number): NodezzleProject {
  return {
    formatVersion: 1,
    id: 'proj-exec',
    name: 'Исполняемая схема',
    kind: 'telegram',
    canvas: {
      id: 'proj-exec:canvas',
      name: 'Исполняемая схема',
      nodes: [
        node('t', 'telegram.message_received'),
        node('d', 'flow.delay', { delayMs }),
        node('s', 'telegram.send_message'),
      ],
      edges: [
        edge('e1', 't', 'text', 'd', 'value'),
        edge('e2', 'd', 'value', 's', 'text'),
        edge('e3', 't', 'chat_id', 's', 'chat_id'),
      ],
    },
    models: [],
    variables: [],
    meta: { createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001 },
  };
}

const tgPayload = { source: 'telegram', telegram: { text: 'Привет', user_id: 7, chat_id: 42 } };

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

async function publishPipeline(delayMs = 0): Promise<{ cookie: string; projectId: string }> {
  const reg = await api('POST', '/api/auth/register', { email: 'exec@example.ru', password: 'Пароль12345', name: 'Рантайм' });
  const cookie = cookieOf(reg);
  const list = (await (await api('GET', '/api/workspaces', undefined, cookie)).json()) as {
    workspaces: Array<{ id: string }>;
  };
  const created = await api('POST', '/api/projects', { workspaceId: list.workspaces[0].id, document: pipelineDoc(delayMs) }, cookie);
  const { project } = (await created.json()) as { project: { id: string } };
  const pub = await api('POST', `/api/projects/${project.id}/publish`, {}, cookie);
  expect(pub.status).toBe(201);
  return { cookie, projectId: project.id };
}

describe('Исполнение опубликованных схем', () => {
  it('исполняет LIVE-версию и возвращает исходящие сообщения', async () => {
    const { cookie, projectId } = await publishPipeline(0);
    const res = await api('POST', `/api/projects/${projectId}/execute`, { payload: tgPayload }, cookie);
    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      result: { status: string; outbox: Array<{ chatId: number; text: string }> };
    };
    expect(payload.result.status).toBe('success');
    expect(payload.result.outbox).toHaveLength(1);
    expect(payload.result.outbox[0].chatId).toBe(42);
    expect(payload.result.outbox[0].text).toBe('Привет');
  });

  it('неопубликованный проект не исполняется (404)', async () => {
    const reg = await api('POST', '/api/auth/register', { email: 'nopub@example.ru', password: 'Пароль12345', name: 'Н' });
    const cookie = cookieOf(reg);
    const list = (await (await api('GET', '/api/workspaces', undefined, cookie)).json()) as {
      workspaces: Array<{ id: string }>;
    };
    const created = await api('POST', '/api/projects', { workspaceId: list.workspaces[0].id, document: pipelineDoc(0) }, cookie);
    const { project } = (await created.json()) as { project: { id: string } };
    expect((await api('POST', `/api/projects/${project.id}/execute`, { payload: tgPayload }, cookie)).status).toBe(404);
  });

  it('исполняет снимок на момент публикации: правки черновика не влияют', async () => {
    const { cookie, projectId } = await publishPipeline(0);
    // Ломает исполнимость черновика, но не опубликованной версии.
    await api('PUT', `/api/projects/${projectId}`, { document: { ...pipelineDoc(0), canvas: { ...pipelineDoc(0).canvas, nodes: [], edges: [] } } }, cookie);
    const res = await api('POST', `/api/projects/${projectId}/execute`, { payload: tgPayload }, cookie);
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { result: { status: string; outbox: unknown[] } };
    expect(payload.result.status).toBe('success');
    expect(payload.result.outbox).toHaveLength(1);
  });

  it('превышение таймаута — статус «таймаут», исполнение отменяется', async () => {
    const { cookie, projectId } = await publishPipeline(1500);
    const res = await api('POST', `/api/projects/${projectId}/execute`, { payload: tgPayload }, cookie);
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { result: { status: string; error?: string } };
    expect(payload.result.status).toBe('timeout');
    expect(payload.result.error).toMatch(/лимит времени/);
  });

  it('превышение параллельных исполнений — 429', async () => {
    const { cookie, projectId } = await publishPipeline(150);
    const [a, b] = await Promise.all([
      api('POST', `/api/projects/${projectId}/execute`, { payload: tgPayload }, cookie),
      api('POST', `/api/projects/${projectId}/execute`, { payload: tgPayload }, cookie),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 429]);
  });

  it('payload обязан быть объектом; без сессии — 401', async () => {
    const { cookie, projectId } = await publishPipeline(0);
    expect((await api('POST', `/api/projects/${projectId}/execute`, { payload: 'строка' }, cookie)).status).toBe(400);
    expect((await api('POST', `/api/projects/${projectId}/execute`, { payload: tgPayload })).status).toBe(401);
  });
});
