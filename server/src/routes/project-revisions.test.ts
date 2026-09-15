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

type Payload = { revision: string; project: ReturnType<typeof projectDocument>; version: { id: string }; projects: { revision: string }[]; error: { code: string }; workspaces: { id: string; name: string }[] };
type TestResponse = Omit<Response, 'json'> & { json(): Promise<Payload> };
async function api(
  method: string,
  url: string,
  body?: Record<string, unknown>,
  cookie?: string,
): Promise<TestResponse> {
  return fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }) as Promise<TestResponse>;
}

function projectDocument(id: string, name = 'Проект') {
  return {
    formatVersion: 1,
    id,
    name,
    kind: 'telegram',
    canvas: { id: `${id}:canvas`, name, nodes: [{ id: 'text', blockId: 'core.text', position: { x: 0, y: 0 }, config: {} }], edges: [] },
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

async function setupRevision() {
  const cookie = await register('revisions@example.invalid', 'Ревизии');
  const workspaceId = await defaultWorkspace(cookie);
  const document = projectDocument('revision-test');
  const created = await api('POST', '/api/projects', { workspaceId, document }, cookie);
  const initial = await created.json();
  expect(created.status).toBe(201);
  const url = `/api/projects/${document.id}`;
  const read = async () => (await api('GET', url, undefined, cookie)).json();
  const audit = () => db.prepare('SELECT * FROM audit_logs ORDER BY id').all();
  return { cookie, workspaceId, document, initial, url, read, audit };
}
describe('контракт ревизий проектов', () => {
  it('POST/GET/list возвращают ревизию вне формата v1, PUT возвращает новую', async () => {
    const { cookie, workspaceId, initial, document, url, read } = await setupRevision();
    expect(initial.revision).toMatch(/^[0-9a-f]{32}$/); expect(initial.project).toEqual(document);
    expect(await read()).toEqual(initial);
    const list = await (await api('GET', `/api/workspaces/${workspaceId}/projects`, undefined, cookie)).json();
    expect(list.projects[0].revision).toBe(initial.revision);
    const saved = await api('PUT', url, { document: { ...document, name: 'Новое' }, expectedRevision: initial.revision }, cookie);
    expect(saved.status).toBe(200);
    const body = await saved.json(); expect(body.revision).not.toBe(initial.revision);
    expect(await read()).toEqual(body); expect(body.project.name).toBe('Новое');
  });
  it('две одновременные записи с общей базой: один успех и один конфликт; проигравшая не меняет аудит', async () => {
    const { cookie, document, initial, url, read, audit } = await setupRevision();
    const before = audit().length;
    const responses = await Promise.all(['А', 'Б'].map((name) => api('PUT', url, { document: { ...document, name }, expectedRevision: initial.revision }, cookie)));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const success = await responses.find((r) => r.status === 200)!.json();
    const conflict = await responses.find((r) => r.status === 409)!.json();
    expect(conflict.error.code).toBe('REVISION_CONFLICT'); expect(conflict.project).toBeUndefined();
    expect(await read()).toEqual(success); expect(audit()).toHaveLength(before + 1);
    // Повтор после потерянного подтверждения не применяет ту же запись второй раз.
    expect((await api('PUT', url, { document: success.project, expectedRevision: initial.revision }, cookie)).status).toBe(409);
    expect(audit()).toHaveLength(before + 1);
  });
  it.each([undefined, null, '', 1, -1, {}, [], 'x'.repeat(32), '*', 'A'.repeat(32)])('не принимает отсутствующую/невалидную ревизию %j', async (revision) => {
    const { cookie, document, initial, url, read, audit } = await setupRevision();
    const snapshot = await (await api('POST', `${url}/versions`, {}, cookie)).json();
    const before = audit();
    for (const [method, target] of [['PUT', url], ['DELETE', url], ['POST', `${url}/versions/${snapshot.version.id}/restore`]]) {
      const response = await api(method, target, { document, expectedRevision: revision }, cookie);
      expect(response.status).toBe(revision === undefined ? 428 : 400);
      expect((await response.json()).error.code).toBe(revision === undefined ? 'REVISION_REQUIRED' : 'BAD_REQUEST');
      expect(await read()).toEqual(initial); expect(audit()).toEqual(before);
    }
  });
  it('restore требует актуальную ревизию черновика, выдаёт новую; снапшот и LIVE не меняются', async () => {
    const { cookie, document, initial, url, read, audit } = await setupRevision();
    const version = (await (await api('POST', `${url}/versions`, { label: 'До' }, cookie)).json()).version;
    expect((await api('POST', `${url}/publish`, {}, cookie)).status).toBe(201);
    const liveBefore = await (await api('GET', `${url}/live`, undefined, cookie)).json();
    const saved = await (await api('PUT', url, { document: { ...document, name: 'После' }, expectedRevision: initial.revision }, cookie)).json();
    const before = audit();
    expect((await api('POST', `${url}/versions/${version.id}/restore`, { expectedRevision: initial.revision }, cookie)).status).toBe(409);
    expect(await read()).toEqual(saved); expect(audit()).toEqual(before);
    const restored = await api('POST', `${url}/versions/${version.id}/restore`, { expectedRevision: saved.revision }, cookie);
    expect(restored.status).toBe(200);
    const body = await restored.json(); expect(body.project).toEqual(document);
    expect(body.revision).not.toBe(saved.revision); expect(body.revision).not.toBe(initial.revision);
    expect(await read()).toEqual(body);
    expect((await (await api('GET', `${url}/versions/${version.id}`, undefined, cookie)).json()).project).toEqual(document);
    expect((await api('PUT', url, { document: saved.project, expectedRevision: saved.revision }, cookie)).status).toBe(409);
    expect(await (await api('GET', `${url}/live`, undefined, cookie)).json()).toEqual(liveBefore);
  });
  it('PUT и restore с одной ревизией не могут оба пройти', async () => {
    const { cookie, document, initial, url, read } = await setupRevision();
    const version = (await (await api('POST', `${url}/versions`, {}, cookie)).json()).version;
    const results = await Promise.all([
      api('PUT', url, { document: { ...document, name: 'Правка' }, expectedRevision: initial.revision }, cookie),
      api('POST', `${url}/versions/${version.id}/restore`, { expectedRevision: initial.revision }, cookie),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await read()).toEqual(await results.find((r) => r.status === 200)!.json());
  });
  it('старый DELETE не удаляет свежий документ; успешный DELETE использует текущую ревизию', async () => {
    const { cookie, document, initial, url, read, audit } = await setupRevision();
    const saved = await (await api('PUT', url, { document, expectedRevision: initial.revision }, cookie)).json();
    const before = audit();
    expect((await api('DELETE', url, { expectedRevision: initial.revision }, cookie)).status).toBe(409);
    expect(await read()).toEqual(saved); expect(audit()).toEqual(before);
    expect((await api('DELETE', url, { expectedRevision: saved.revision }, cookie)).status).toBe(200);
    expect((await api('GET', url, undefined, cookie)).status).toBe(404);
  });
  it('чужой/анонимный клиент не узнаёт ревизию и не меняет документ даже зная её', async () => {
    const { document, initial, url, read, audit, cookie } = await setupRevision();
    const version = (await (await api('POST', `${url}/versions`, {}, cookie)).json()).version;
    const other = await register('other@example.invalid', 'Другой');
    const before = audit();
    for (const who of [other, undefined]) {
      for (const [method, target] of [['GET', url], ['PUT', url], ['DELETE', url], ['POST', `${url}/versions/${version.id}/restore`]]) {
        const response = await api(method, target, method === 'GET' ? undefined : { document, expectedRevision: initial.revision }, who);
        expect(response.status).toBe(who ? 404 : 401);
        expect(await response.json()).not.toHaveProperty('revision');
      }
    }
    expect(await read()).toEqual(initial); expect(audit()).toEqual(before);
  });
});

describe('границы условной записи', () => {
  it('невалидный документ не меняет ревизию, индексы, даты и аудит', async () => {
    const { cookie, document, initial, url, read, audit } = await setupRevision();
    const before = audit();
    for (const invalid of [null, { ...document, formatVersion: 99 }, { ...document, id: 'other' }]) {
      expect((await api('PUT', url, { document: invalid, expectedRevision: initial.revision }, cookie)).status).toBe(400);
      expect(await read()).toEqual(initial); expect(audit()).toEqual(before);
    }
  });
  it.each(['PUT', 'DELETE', 'RESTORE'].flatMap((method) => ['session', 'membership'].map((revoke) => [method, revoke])))('%s перепроверяет %s после чтения медленного тела', async (method, revoke) => {
    const { cookie, document, initial, url, workspaceId, audit } = await setupRevision();
    const version = (await (await api('POST', `${url}/versions`, {}, cookie)).json()).version;
    const target = method === 'RESTORE' ? `${url}/versions/${version.id}/restore` : url;
    const arrived = new Promise<void>((resolve) => server.once('request', () => resolve()));
    const serialized = JSON.stringify({ document: { ...document, name: 'Запоздалая правка' }, expectedRevision: initial.revision });
    const request = http.request(`${baseUrl}${target}`, { method: method === 'RESTORE' ? 'POST' : method, headers: { cookie, 'content-type': 'application/json', 'content-length': Buffer.byteLength(serialized) } });
    const response = new Promise<number>((resolve, reject) => {
      request.on('error', reject);
      request.on('response', (res) => { res.resume(); res.on('end', () => resolve(res.statusCode!)); });
    });
    request.flushHeaders();
    await arrived;
    try {
      if (revoke === 'session') expect((await api('POST', '/api/auth/logout', {}, cookie)).status).toBe(200);
      else db.prepare('DELETE FROM workspace_members WHERE workspace_id = ?').run(workspaceId);
      const before = audit();
      request.end(serialized);
      expect(await response).toBe(revoke === 'session' ? 401 : 404);
      const row = db.prepare('SELECT document, revision FROM projects WHERE id = ?').get(document.id)!;
      expect(JSON.parse(row.document as string)).toEqual(document); expect(row.revision).toBe(initial.revision);
      expect(audit()).toEqual(before);
    } finally { request.destroy(); }
  });
});

it('серверный редактор может привязать PUT к исходному пользователю сессии', async () => {
  const { cookie, document, initial, url, read, audit } = await setupRevision();
  const before = audit();
  expect((await api('PUT', url, { document, expectedRevision: initial.revision, expectedUserId: 'another-user' }, cookie)).status).toBe(401);
  expect(await read()).toEqual(initial); expect(audit()).toEqual(before);
  const userId = db.prepare("SELECT id FROM users WHERE email = 'revisions@example.invalid'").get()!.id;
  expect((await api('PUT', url, { document, expectedRevision: initial.revision, expectedUserId: userId }, cookie)).status).toBe(200);
});
