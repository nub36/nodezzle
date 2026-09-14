/** Секреты: только метаданные наружу; значения — только внутри сервера. */

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

async function workspaceCookie(email: string): Promise<{ cookie: string; workspaceId: string }> {
  const reg = await api('POST', '/api/auth/register', { email, password: 'Пароль12345', name: 'Тест' });
  const cookie = cookieOf(reg);
  const list = (await (await api('GET', '/api/workspaces', undefined, cookie)).json()) as {
    workspaces: Array<{ id: string }>;
  };
  return { cookie, workspaceId: list.workspaces[0].id };
}

describe('Секреты рабочего пространства', () => {
  it('создаёт секрет и отдаёт только метаданные — значение наружу не уходит', async () => {
    const { cookie, workspaceId } = await workspaceCookie('sec1@example.ru');
    const created = await api('POST', `/api/workspaces/${workspaceId}/secrets`, { name: 'TG_BOT_TOKEN', value: '123456:СекретноеЗначение' }, cookie);
    expect(created.status).toBe(201);
    const payload = (await created.json()) as { secret: { id: string; name: string } };
    expect(payload.secret.name).toBe('TG_BOT_TOKEN');
    expect(JSON.stringify(payload)).not.toContain('СекретноеЗначение');

    const listed = (await (await api('GET', `/api/workspaces/${workspaceId}/secrets`, undefined, cookie)).json()) as {
      secrets: Array<{ name: string }>;
    };
    expect(listed.secrets.map((s) => s.name)).toEqual(['TG_BOT_TOKEN']);
    expect(JSON.stringify(listed)).not.toContain('СекретноеЗначение');
  });

  it('в базе хранится только шифротекст, а внутреннее чтение расшифровывает', async () => {
    const { cookie, workspaceId } = await workspaceCookie('sec2@example.ru');
    const created = await api('POST', `/api/workspaces/${workspaceId}/secrets`, { name: 'API_KEY', value: 'value-987' }, cookie);
    const { secret } = (await created.json()) as { secret: { id: string } };
    const rows = db.prepare('SELECT ciphertext, iv, tag FROM secrets WHERE id = ?').all(secret.id) as unknown as Array<{
      ciphertext: string;
      iv: string;
      tag: string;
    }>;
    expect(rows[0].ciphertext).not.toContain('value-987');
    // Проверка симметрии через тот же механизм, что у хранилища.
    const { decryptValue, resolveVaultKey } = await import('../security/vault.ts');
    expect(decryptValue(resolveVaultKey(config), rows[0])).toBe('value-987');
  });

  it('дубликат имени в пространстве — 409; без поля — 400', async () => {
    const { cookie, workspaceId } = await workspaceCookie('sec3@example.ru');
    await api('POST', `/api/workspaces/${workspaceId}/secrets`, { name: 'ОДИН', value: 'а' }, cookie);
    expect((await api('POST', `/api/workspaces/${workspaceId}/secrets`, { name: 'ОДИН', value: 'б' }, cookie)).status).toBe(409);
    expect((await api('POST', `/api/workspaces/${workspaceId}/secrets`, { name: '', value: 'б' }, cookie)).status).toBe(400);
    expect((await api('POST', `/api/workspaces/${workspaceId}/secrets`, { name: 'БЕЗ' }, cookie)).status).toBe(400);
  });

  it('чужое пространство и чужие секреты — 404; без сессии — 401', async () => {
    const owner = await workspaceCookie('sec4@example.ru');
    const stranger = await workspaceCookie('sec5@example.ru');
    await api('POST', `/api/workspaces/${owner.workspaceId}/secrets`, { name: 'KEY', value: 'v' }, owner.cookie);

    expect((await api('GET', `/api/workspaces/${owner.workspaceId}/secrets`, undefined, stranger.cookie)).status).toBe(404);
    expect((await api('POST', `/api/workspaces/${owner.workspaceId}/secrets`, { name: 'X', value: 'y' }, stranger.cookie)).status).toBe(404);
    expect((await api('GET', `/api/workspaces/${owner.workspaceId}/secrets`)).status).toBe(401);
  });

  it('удаляет секрет', async () => {
    const { cookie, workspaceId } = await workspaceCookie('sec6@example.ru');
    const created = await api('POST', `/api/workspaces/${workspaceId}/secrets`, { name: 'DELETE_ME', value: 'v' }, cookie);
    const { secret } = (await created.json()) as { secret: { id: string } };
    expect((await api('DELETE', `/api/workspaces/${workspaceId}/secrets/${secret.id}`, undefined, cookie)).status).toBe(200);
    const listed = (await (await api('GET', `/api/workspaces/${workspaceId}/secrets`, undefined, cookie)).json()) as {
      secrets: unknown[];
    };
    expect(listed.secrets).toEqual([]);
    expect((await api('DELETE', `/api/workspaces/${workspaceId}/secrets/${secret.id}`, undefined, cookie)).status).toBe(404);
  });
});
