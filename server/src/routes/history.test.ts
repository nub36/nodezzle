/** АПИ истории исполнений и журнала действий: пагинация, фильтры, изоляция. */

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
  execTimeoutMs: 3_000,
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

const makeDoc = (suffix: string) => ({
  formatVersion: 1,
  id: `proj-hist-${suffix}`,
  name: 'История',
  kind: 'telegram',
  canvas: {
    id: `proj-hist-${suffix}:canvas`,
    name: 'История',
    nodes: [{ id: 'n1', blockId: 'core.text', position: { x: 0, y: 0 }, config: { value: 'тест' } }],
    edges: [],
  },
  models: [],
  variables: [],
  meta: { createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001 },
});

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

async function setup(): Promise<{ cookie: string; workspaceId: string; projectId: string }> {
  const reg = await api('POST', '/api/auth/register', {
    email: `h-${Math.random().toString(36).slice(2)}@example.ru`,
    password: 'Пароль12345',
    name: 'История',
  });
  const cookie = cookieOf(reg);
  const list = (await (await api('GET', '/api/workspaces', undefined, cookie)).json()) as {
    workspaces: Array<{ id: string }>;
  };
  const created = await api('POST', '/api/projects', { workspaceId: list.workspaces[0].id, document: makeDoc(Math.random().toString(36).slice(2)) }, cookie);
  const project = (await created.json()) as { project: { id: string } };
  await api('POST', `/api/projects/${project.project.id}/publish`, {}, cookie);
  return { cookie, workspaceId: list.workspaces[0].id, projectId: project.project.id };
}

describe('История исполнений', () => {
  it('список новые → старые, пагинация и лимит по умолчанию 25', async () => {
    const { cookie, projectId } = await setup();
    for (let i = 0; i < 3; i += 1) {
      const res = await api('POST', `/api/projects/${projectId}/execute`, { payload: {} }, cookie);
      expect(res.status).toBe(200);
    }
    const list = (await (await api('GET', `/api/projects/${projectId}/executions`, undefined, cookie)).json()) as {
      executions: Array<{ id: string; status: string }>;
    };
    expect(list.executions).toHaveLength(3);
    expect(list.executions[0].status).toBe('success');

    const page = (await (await api('GET', `/api/projects/${projectId}/executions?limit=2&offset=0`, undefined, cookie)).json()) as {
      executions: Array<{ id: string }>;
    };
    expect(page.executions).toHaveLength(2);
    expect(page.executions[0].id).toBe(list.executions[0].id);

    const tail = (await (await api('GET', `/api/projects/${projectId}/executions?limit=2&offset=2`, undefined, cookie)).json()) as {
      executions: Array<{ id: string }>;
    };
    expect(tail.executions).toHaveLength(1);
    expect(tail.executions[0].id).toBe(list.executions[2].id);
  });

  it('фильтр по статусу и неверные параметры', async () => {
    const { cookie, projectId } = await setup();
    await api('POST', `/api/projects/${projectId}/execute`, { payload: {} }, cookie);
    const ok = (await (await api('GET', `/api/projects/${projectId}/executions?status=success`, undefined, cookie)).json()) as {
      executions: unknown[];
    };
    expect(ok.executions.length).toBeGreaterThanOrEqual(1);

    expect((await api('GET', `/api/projects/${projectId}/executions?status=взломано`, undefined, cookie)).status).toBe(400);
    expect((await api('GET', `/api/projects/${projectId}/executions?limit=0`, undefined, cookie)).status).toBe(400);
    expect((await api('GET', `/api/projects/${projectId}/executions?limit=101`, undefined, cookie)).status).toBe(400);
    expect((await api('GET', `/api/projects/${projectId}/executions?limit=abc`, undefined, cookie)).status).toBe(400);
    expect((await api('GET', `/api/projects/${projectId}/executions?offset=-1`, undefined, cookie)).status).toBe(400);
  });

  it('конкретное исполнение и его шаги; чужое — 404', async () => {
    const owner = await setup();
    const stranger = await setup();
    await api('POST', `/api/projects/${owner.projectId}/execute`, { payload: {} }, owner.cookie);
    const list = (await (await api('GET', `/api/projects/${owner.projectId}/executions`, undefined, owner.cookie)).json()) as {
      executions: Array<{ id: string }>;
    };
    const executionId = list.executions[0].id;

    const own = await api('GET', `/api/executions/${executionId}`, undefined, owner.cookie);
    expect(own.status).toBe(200);
    const steps = (await (await api('GET', `/api/executions/${executionId}/steps`, undefined, owner.cookie)).json()) as {
      steps: Array<{ sequence: number; blockType: string }>;
    };
    expect(steps.steps.length).toBeGreaterThanOrEqual(1);
    expect(steps.steps[0].sequence).toBe(1);

    expect((await api('GET', `/api/executions/${executionId}`, undefined, stranger.cookie)).status).toBe(404);
    expect((await api('GET', `/api/executions/${executionId}/steps`, undefined, stranger.cookie)).status).toBe(404);
    expect((await api('GET', `/api/executions/нет-такого`, undefined, owner.cookie)).status).toBe(404);
  });
});

describe('Журнал действий через АПИ', () => {
  it('чтение с пагинацией и фильтром; записи/правки/удаления нет', async () => {
    const { cookie, workspaceId, projectId } = await setup();
    await api('POST', `/api/projects/${projectId}/versions`, { label: 'Снимок' }, cookie);

    const all = (await (await api('GET', `/api/workspaces/${workspaceId}/audit`, undefined, cookie)).json()) as {
      entries: Array<{ action: string; actorUserId: string | null }>;
    };
    expect(all.entries.length).toBeGreaterThanOrEqual(3); // регистрация + создание + публикация + снапшот
    expect(all.entries.some((e) => e.action === 'project.publish')).toBe(true);
    for (const entry of all.entries) expect(entry.actorUserId).not.toBeNull();

    const filtered = (await (await api('GET', `/api/workspaces/${workspaceId}/audit?action=project.publish`, undefined, cookie)).json()) as {
      entries: Array<{ action: string }>;
    };
    expect(filtered.entries.length).toBeGreaterThanOrEqual(1);
    expect(filtered.entries.every((e) => e.action === 'project.publish')).toBe(true);

    // Фильтр по группе: «project.» — все действия проектов и версий с этим префиксом.
    const group = (await (await api('GET', `/api/workspaces/${workspaceId}/audit?action=project.`, undefined, cookie)).json()) as {
      entries: Array<{ action: string }>;
    };
    expect(group.entries.length).toBeGreaterThanOrEqual(2);
    expect(group.entries.every((e) => e.action.startsWith('project.'))).toBe(true);

    const page = (await (await api('GET', `/api/workspaces/${workspaceId}/audit?limit=2&offset=0`, undefined, cookie)).json()) as {
      entries: unknown[];
    };
    expect(page.entries).toHaveLength(2);

    // Пользовательских создания/изменения/удаления журнала нет:
    // путь существует только на чтение — прочие методы отклоняются.
    expect((await api('POST', `/api/workspaces/${workspaceId}/audit`, { action: 'hack' }, cookie)).status).toBe(405);
    expect((await api('PUT', `/api/workspaces/${workspaceId}/audit`, { action: 'hack' }, cookie)).status).toBe(405);
    expect((await api('DELETE', `/api/workspaces/${workspaceId}/audit`, undefined, cookie)).status).toBe(405);
  });

  it('чужой журнал не читается; без сессии — 401', async () => {
    const owner = await setup();
    const stranger = await setup();
    expect((await api('GET', `/api/workspaces/${owner.workspaceId}/audit`, undefined, stranger.cookie)).status).toBe(404);
    expect((await api('GET', `/api/workspaces/${owner.workspaceId}/audit`)).status).toBe(401);
    expect((await api('GET', `/api/projects/${owner.projectId}/executions`, undefined, stranger.cookie)).status).toBe(404);
  });
});
