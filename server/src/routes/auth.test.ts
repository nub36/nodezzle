/** Аккаунты: регистрация, вход, выход, текущий пользователь, лимит попыток. */

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
  maxBodyBytes: 1024,
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

describe('Аккаунты', () => {
  const valid = { email: 'Ivan@Example.ru ', password: 'Пароль12345', name: 'Иван' };

  it('регистрирует пользователя и сразу выдаёт сессию', async () => {
    const res = await api('POST', '/api/auth/register', valid);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: { email: string; name: string } };
    expect(body.user.email).toBe('ivan@example.ru');
    expect(body.user.name).toBe('Иван');
    const cookie = cookieOf(res);
    expect(cookie).toContain('nodezzle_session=');
    expect(cookie).toContain('HttpOnly');

    const me = await api('GET', '/api/auth/me', undefined, cookie);
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { user: { email: string } };
    expect(meBody.user.email).toBe('ivan@example.ru');
  });

  it('отвергает повторную регистрацию и некорректные данные', async () => {
    expect((await api('POST', '/api/auth/register', valid)).status).toBe(201);
    const dup = await api('POST', '/api/auth/register', { ...valid, email: 'ivan@example.ru' });
    expect(dup.status).toBe(409);
    expect((await api('POST', '/api/auth/register', { email: 'не-почта', password: 'Пароль12345', name: 'А' })).status).toBe(400);
    expect((await api('POST', '/api/auth/register', { email: 'a@b.ru', password: 'семь', name: 'А' })).status).toBe(400);
    expect((await api('POST', '/api/auth/register', { email: 'a@b.ru', password: 'Пароль12345', name: '' })).status).toBe(400);
  });

  it('впускает с верным паролем и отвергает неверный единой ошибкой', async () => {
    await api('POST', '/api/auth/register', valid);
    const ok = await api('POST', '/api/auth/login', { email: 'ivan@example.ru', password: valid.password });
    expect(ok.status).toBe(200);
    expect(cookieOf(ok)).toContain('nodezzle_session=');

    const badPass = await api('POST', '/api/auth/login', { email: 'ivan@example.ru', password: 'неверный пароль' });
    expect(badPass.status).toBe(401);
    const badEmail = await api('POST', '/api/auth/login', { email: 'нет-такого@b.ru', password: 'Пароль12345' });
    expect(badEmail.status).toBe(401);
    const body = (await badEmail.json()) as { error: { message: string } };
    expect(body.error.message).toBe('Неверный адрес или пароль');
  });

  it('выход отзывает сессию', async () => {
    const reg = await api('POST', '/api/auth/register', valid);
    const cookie = cookieOf(reg);
    expect((await api('GET', '/api/auth/me', undefined, cookie)).status).toBe(200);

    const out = await api('POST', '/api/auth/logout', undefined, cookie);
    expect(out.status).toBe(200);
    expect((await api('GET', '/api/auth/me', undefined, cookie)).status).toBe(401);
    // Cookie сбрасывается.
    expect(out.headers.getSetCookie?.().join(';')).toContain('Max-Age=0');
  });

  it('не принимает подделанную сессионную cookie', async () => {
    const reg = await api('POST', '/api/auth/register', valid);
    const value = cookieOf(reg).replace('nodezzle_session=', '').split(';')[0];
    const forged = `nodezzle_session=${value}AAAA`;
    expect((await api('GET', '/api/auth/me', undefined, forged)).status).toBe(401);
    expect((await api('GET', '/api/auth/me', undefined, 'nodezzle_session=totally-foreign')).status).toBe(401);
    expect((await api('GET', '/api/auth/me')).status).toBe(401);
  });

  it('ограничивает частоту попыток входа с одного адреса', async () => {
    let last = 0;
    for (let i = 0; i < 25; i += 1) {
      last = (await api('POST', '/api/auth/login', { email: 'x@y.ru', password: 'Пароль12345' })).status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });
});
