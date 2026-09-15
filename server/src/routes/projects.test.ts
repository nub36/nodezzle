/**
 * Проекты и рабочие пространства на сервере: владение, валидация
 * формата, CRUD, изоляция пользователей.
 */

import http, { type Server } from 'node:http';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import type { ServerConfig } from '../config.ts';
import { openDb, runMigrations, type Db } from '../db.ts';

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

async function api(
  method: string,
  url: string,
  body?: Record<string, unknown>,
  cookie?: string,
): Promise<Response> {
  return fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function projectDocument(id: string, name = 'Проект') {
  return {
    formatVersion: 1,
    id,
    name,
    kind: 'telegram',
    canvas: { id: `${id}:canvas`, name, nodes: [], edges: [] },
    models: [],
    variables: [],
    meta: { createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001 },
  };
}

async function register(email: string, name: string): Promise<string> {
  const res = await api('POST', '/api/auth/register', { email, password: 'Пароль12345', name });
  expect(res.status).toBe(201);
  return cookieOf(res);
}

async function defaultWorkspace(cookie: string): Promise<string> {
  const res = await api('GET', '/api/workspaces', undefined, cookie);
  const body = (await res.json()) as { workspaces: Array<{ id: string; name: string }> };
  expect(body.workspaces.length).toBeGreaterThan(0);
  return body.workspaces[0].id;
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

describe('Рабочие пространства', () => {
  it('при регистрации создаётся пространство по умолчанию; можно добавить своё', async () => {
    const cookie = await register('user1@example.ru', 'Пользователь');
    const list = await api('GET', '/api/workspaces', undefined, cookie);
    const body = (await list.json()) as { workspaces: Array<{ name: string }> };
    expect(body.workspaces.map((w) => w.name)).toContain('Мои проекты');

    const created = await api('POST', '/api/workspaces', { name: 'Команда' }, cookie);
    expect(created.status).toBe(201);
    const again = (await (await api('GET', '/api/workspaces', undefined, cookie)).json()) as {
      workspaces: Array<{ name: string }>;
    };
    expect(again.workspaces.map((w) => w.name)).toEqual(expect.arrayContaining(['Мои проекты', 'Команда']));
  });

  it('создание пространства без входа и с пустым именем отклоняется', async () => {
    expect((await api('POST', '/api/workspaces', { name: 'X' })).status).toBe(401);
    const cookie = await register('user2@example.ru', 'Пользователь');
    expect((await api('POST', '/api/workspaces', { name: '   ' }, cookie)).status).toBe(400);
  });
});

describe('Проекты на сервере', () => {
  it('полный цикл: создать, прочитать, обновить, удалить', async () => {
    const cookie = await register('user3@example.ru', 'Пользователь');
    const wsId = await defaultWorkspace(cookie);

    const empty = (await (await api('GET', `/api/workspaces/${wsId}/projects`, undefined, cookie)).json()) as {
      projects: unknown[];
    };
    expect(empty.projects).toEqual([]);

    const doc = projectDocument('proj-001', 'Мой бот');
    const created = await api('POST', '/api/projects', { workspaceId: wsId, document: doc }, cookie);
    expect(created.status).toBe(201);

    const fetched = await api('GET', '/api/projects/proj-001', undefined, cookie);
    expect(fetched.status).toBe(200);
    const body = (await fetched.json()) as { project: { id: string; name: string }; revision: string };
    expect(body.project).toEqual(doc);

    const updated = await api(
      'PUT',
      '/api/projects/proj-001',
      { document: { ...doc, name: 'Мой бот (новый)' }, expectedRevision: body.revision },
      cookie,
    );
    expect(updated.status).toBe(200);
    const updatedBody = (await updated.json()) as { project: { name: string }; revision: string };
    expect(updatedBody.project.name).toBe('Мой бот (новый)');

    expect((await api('DELETE', '/api/projects/proj-001', { expectedRevision: updatedBody.revision }, cookie)).status).toBe(200);
    expect((await api('GET', '/api/projects/proj-001', undefined, cookie)).status).toBe(404);
  });

  it('отвергает невалидный документ, дубли и чужое пространство', async () => {
    const cookie = await register('user4@example.ru', 'Пользователь');
    const wsId = await defaultWorkspace(cookie);

    const bad = await api('POST', '/api/projects', { workspaceId: wsId, document: { formatVersion: 99 } }, cookie);
    expect(bad.status).toBe(400);

    const doc = projectDocument('proj-dup');
    expect((await api('POST', '/api/projects', { workspaceId: wsId, document: doc }, cookie)).status).toBe(201);
    expect((await api('POST', '/api/projects', { workspaceId: wsId, document: doc }, cookie)).status).toBe(409);

    expect((await api('POST', '/api/projects', { workspaceId: 'нет-такого', document: doc }, cookie)).status).toBe(404);
  });

  it('PUT с другим идентификатором документа отклоняется', async () => {
    const cookie = await register('user5@example.ru', 'Пользователь');
    const wsId = await defaultWorkspace(cookie);
    await api('POST', '/api/projects', { workspaceId: wsId, document: projectDocument('proj-a') }, cookie);
    const res = await api(
      'PUT',
      '/api/projects/proj-a',
      { document: projectDocument('proj-b') },
      cookie,
    );
    expect(res.status).toBe(400);
  });

  it('изолирует пользователей: чужие проекты не видны', async () => {
    const alice = await register('alice@example.ru', 'Алиса');
    const wsAlice = await defaultWorkspace(alice);
    await api('POST', '/api/projects', { workspaceId: wsAlice, document: projectDocument('secret-proj') }, alice);

    const bob = await register('bob@example.ru', 'Боб');
    expect((await api('GET', '/api/projects/secret-proj', undefined, bob)).status).toBe(404);
    expect((await api('DELETE', '/api/projects/secret-proj', undefined, bob)).status).toBe(404);
    expect((await api('GET', `/api/workspaces/${wsAlice}/projects`, undefined, bob)).status).toBe(404);

    // И у Боба проект Алисы не появляется в его списке.
    const wsBob = await defaultWorkspace(bob);
    const list = (await (await api('GET', `/api/workspaces/${wsBob}/projects`, undefined, bob)).json()) as {
      projects: unknown[];
    };
    expect(list.projects).toEqual([]);
  });

  it('без сессии все маршруты отвечают 401', async () => {
    expect((await api('GET', '/api/workspaces')).status).toBe(401);
    expect((await api('POST', '/api/projects', { document: {} })).status).toBe(401);
    expect((await api('GET', '/api/projects/proj-001')).status).toBe(401);
  });
});
