/** Журнал действий: критические события, акторы, санитайзер, только добавление. */

import http, { type Server } from 'node:http';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import type { ServerConfig } from '../config.ts';
import { openDb, runMigrations, type Db } from '../db.ts';
import { createAuditStore } from './store.ts';

const SECRET_VALUE = '555000111:AAEhBP0avF9YqQx6K3n1Q7u8Jv0w2X4y5zA';

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

interface AuditRow {
  action: string;
  workspace_id: string | null;
  actor_user_id: string | null;
  target_type: string | null;
  target_id: string | null;
  metadata: string | null;
}

function auditRows(): AuditRow[] {
  return db.prepare('SELECT action, workspace_id, actor_user_id, target_type, target_id, metadata FROM audit_logs ORDER BY created_at, rowid').all() as unknown as AuditRow[];
}

beforeEach(async () => {
  db = openDb(':memory:');
  runMigrations(db, path.join(config.repoRoot, 'server', 'migrations'));
  const app = createApp({
    config,
    db,
    version: '0.0.0-test',
    telegramTransportFor: () => ({
      getMe: async () => ({ id: 1 }),
      sendMessage: async () => ({ messageId: 1 }),
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

describe('Журнал действий (5.9D)', () => {
  it('записывает события аккаунта: регистрация, вход, выход', async () => {
    const reg = await api('POST', '/api/auth/register', { email: 'audit@example.ru', password: 'Пароль12345', name: 'Аудит' });
    const cookie = cookieOf(reg);
    await api('POST', '/api/auth/login', { email: 'audit@example.ru', password: 'Пароль12345' });
    await api('POST', '/api/auth/logout', undefined, cookie);

    const actions = auditRows().map((r) => r.action);
    expect(actions).toEqual(['auth.register', 'auth.login', 'auth.logout']);
    for (const row of auditRows()) {
      expect(row.actor_user_id).not.toBeNull();
    }
  });

  it('записывает жизненный цикл проекта: создание, правка, снапшот, публикация, восстановление, удаление', async () => {
    const reg = await api('POST', '/api/auth/register', { email: 'p@example.ru', password: 'Пароль12345', name: 'П' });
    const cookie = cookieOf(reg);
    const list = (await (await api('GET', '/api/workspaces', undefined, cookie)).json()) as {
      workspaces: Array<{ id: string }>;
    };
    const workspaceId = list.workspaces[0].id;
    const doc = {
      formatVersion: 1,
      id: 'proj-audit',
      name: 'Аудит-проект',
      kind: 'telegram',
      canvas: {
        id: 'proj-audit:canvas',
        name: 'Аудит-проект',
        nodes: [{ id: 'n1', blockId: 'core.text', position: { x: 0, y: 0 }, config: {} }],
        edges: [],
      },
      models: [],
      variables: [],
      meta: { createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001 },
    };
    const created = await api('POST', '/api/projects', { workspaceId, document: doc }, cookie);
    const { project } = (await created.json()) as { project: { id: string } };
    await api('PUT', `/api/projects/${project.id}`, { document: { ...doc, name: 'Правка' } }, cookie);
    const snapshot = await api('POST', `/api/projects/${project.id}/versions`, { label: 'Ручной' }, cookie);
    const { version } = (await snapshot.json()) as { version: { id: string } };
    await api('POST', `/api/projects/${project.id}/publish`, {}, cookie);
    await api('POST', `/api/projects/${project.id}/versions/${version.id}/restore`, {}, cookie);
    await api('DELETE', `/api/projects/${project.id}`, undefined, cookie);

    const actions = auditRows().map((r) => r.action);
    expect(actions).toEqual([
      'auth.register',
      'project.create',
      'project.update',
      'version.create',
      'project.publish',
      'version.restore',
      'project.delete',
    ]);
    const publish = auditRows().find((r) => r.action === 'project.publish')!;
    expect(publish.workspace_id).toBe(workspaceId);
    expect(publish.target_type).toBe('project_version');
  });

  it('записывает секреты и ботов; значения секретов в метаданных не появляются', async () => {
    const reg = await api('POST', '/api/auth/register', { email: 's@example.ru', password: 'Пароль12345', name: 'С' });
    const cookie = cookieOf(reg);
    const list = (await (await api('GET', '/api/workspaces', undefined, cookie)).json()) as {
      workspaces: Array<{ id: string }>;
    };
    const workspaceId = list.workspaces[0].id;
    const secret = await api('POST', `/api/workspaces/${workspaceId}/secrets`, { name: 'TG_TOKEN', value: SECRET_VALUE }, cookie);
    const { secret: secretMeta } = (await secret.json()) as { secret: { id: string } };
    const bot = await api('POST', `/api/workspaces/${workspaceId}/telegram-bots`, { secretId: secretMeta.id }, cookie);
    const { bot: botMeta } = (await bot.json()) as { bot: { id: string; webhookPath: string } };
    await api('PATCH', `/api/workspaces/${workspaceId}/telegram-bots/${botMeta.id}`, { projectId: null }, cookie);
    await api('POST', `/api/workspaces/${workspaceId}/telegram-bots/${botMeta.id}/webhook`, { publicUrl: 'https://n.example' }, cookie);
    await api('DELETE', `/api/workspaces/${workspaceId}/telegram-bots/${botMeta.id}/webhook`, undefined, cookie);
    await api('DELETE', `/api/workspaces/${workspaceId}/telegram-bots/${botMeta.id}`, undefined, cookie);
    await api('DELETE', `/api/workspaces/${workspaceId}/secrets/${secretMeta.id}`, undefined, cookie);

    const actions = auditRows().map((r) => r.action);
    expect(actions).toEqual([
      'auth.register',
      'secret.create',
      'telegram.bot_connect',
      'telegram.bot_update',
      'telegram.webhook_register',
      'telegram.webhook_delete',
      'telegram.bot_disconnect',
      'secret.delete',
    ]);
    const allMetadata = auditRows().map((r) => r.metadata ?? '').join('\n');
    expect(allMetadata).not.toContain(SECRET_VALUE);
    expect(allMetadata).not.toContain(botMeta.webhookPath);
  });

  it('журнал — только добавление: изменять и удалять записи нельзя', () => {
    const store = createAuditStore(db);
    expect(typeof (store as unknown as Record<string, unknown>).update).toBe('undefined');
    expect(typeof (store as unknown as Record<string, unknown>).delete).toBe('undefined');
    expect(typeof (store as unknown as Record<string, unknown>).remove).toBe('undefined');
  });

  it('метаданные проходят санитайзер даже при попытке передать секреты', () => {
    const store = createAuditStore(db);
    store.append({
      workspaceId: null,
      actorUserId: null,
      action: 'test.sanitize',
      metadata: { password: 'x', token: SECRET_VALUE, nested: { api_key: 'k' } },
    });
    const row = db.prepare("SELECT metadata FROM audit_logs WHERE action = 'test.sanitize'").get() as unknown as {
      metadata: string;
    };
    expect(row.metadata).not.toContain(SECRET_VALUE);
    expect(row.metadata).toContain('[СКРЫТО]');
  });

  it('записи двух пользователей разделены по пространствам', async () => {
    const first = await api('POST', '/api/auth/register', { email: 'a1@example.ru', password: 'Пароль12345', name: 'А' });
    void cookieOf(first);
    const second = await api('POST', '/api/auth/register', { email: 'a2@example.ru', password: 'Пароль12345', name: 'Б' });
    void cookieOf(second);
    const rows = auditRows().filter((r) => r.action === 'auth.register');
    expect(rows).toHaveLength(2);
    expect(rows[0].actor_user_id).not.toBe(rows[1].actor_user_id);
  });
});
