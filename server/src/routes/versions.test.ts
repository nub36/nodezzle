/** Версии проектов: снапшоты черновика, список, восстановление, изоляция. */

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

function projectDocument(id: string, name: string) {
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

async function setup(): Promise<{ cookie: string; projectId: string }> {
  const reg = await api('POST', '/api/auth/register', {
    email: 'ver@example.ru',
    password: 'Пароль12345',
    name: 'Версия',
  });
  const cookie = cookieOf(reg);
  const ws = (await (await api('GET', '/api/workspaces', undefined, cookie)).json()) as {
    workspaces: Array<{ id: string }>;
  };
  const projectId = 'proj-version';
  await api('POST', '/api/projects', { workspaceId: ws.workspaces[0].id, document: projectDocument(projectId, 'Исходное имя') }, cookie);
  return { cookie, projectId };
}

describe('Версии проектов', () => {
  it('создаёт снапшот, показывает список, возвращает копию и восстанавливает черновик', async () => {
    const { cookie, projectId } = await setup();

    const created = await api('POST', `/api/projects/${projectId}/versions`, { label: 'До правок' }, cookie);
    expect(created.status).toBe(201);
    const version = ((await created.json()) as { version: { id: string; label: string } }).version;
    expect(version.label).toBe('До правок');

    // Черновик меняется независимо от снапшота.
    await api('PUT', `/api/projects/${projectId}`, { expectedRevision: (await (await api('GET', `/api/projects/${projectId}`, undefined, cookie)).json() as { revision: string }).revision, document: projectDocument(projectId, 'Изменённое имя') }, cookie);

    const list = (await (await api('GET', `/api/projects/${projectId}/versions`, undefined, cookie)).json()) as {
      versions: Array<{ id: string; label: string }>;
    };
    expect(list.versions.map((v) => v.label)).toEqual(['До правок']);

    const snap = (await (await api('GET', `/api/projects/${projectId}/versions/${version.id}`, undefined, cookie)).json()) as {
      project: { name: string };
    };
    expect(snap.project.name).toBe('Исходное имя');

    const restored = await api('POST', `/api/projects/${projectId}/versions/${version.id}/restore`, { expectedRevision: (await (await api('GET', `/api/projects/${projectId}`, undefined, cookie)).json() as { revision: string }).revision }, cookie);
    expect(restored.status).toBe(200);
    const fresh = (await (await api('GET', `/api/projects/${projectId}`, undefined, cookie)).json()) as {
      project: { name: string };
    };
    expect(fresh.project.name).toBe('Исходное имя');
  });

  it('метка по умолчанию — на русском с датой', async () => {
    const { cookie, projectId } = await setup();
    const created = await api('POST', `/api/projects/${projectId}/versions`, {}, cookie);
    const version = ((await created.json()) as { version: { label: string } }).version;
    expect(version.label).toMatch(/Версия от /);
  });

  it('чужие версии не видны и не восстанавлируются', async () => {
    const { projectId } = await setup();
    const other = await api('POST', '/api/auth/register', {
      email: 'other@example.ru',
      password: 'Пароль12345',
      name: 'Чужой',
    });
    const otherCookie = cookieOf(other);
    expect((await api('GET', `/api/projects/${projectId}/versions`, undefined, otherCookie)).status).toBe(404);
    expect((await api('POST', `/api/projects/${projectId}/versions`, { label: 'x' }, otherCookie)).status).toBe(404);
    expect((await api('POST', `/api/projects/${projectId}/versions/любой/restore`, {}, otherCookie)).status).toBe(404);
  });

  it('несуществующая версия — 404', async () => {
    const { cookie, projectId } = await setup();
    expect((await api('GET', `/api/projects/${projectId}/versions/нет-такой`, undefined, cookie)).status).toBe(404);
  });
});
