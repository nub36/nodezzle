/** Публикация: серверная валидация → неизменяемая LIVE-версия. */

import http, { type Server } from 'node:http';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import type { ServerConfig } from '../config.ts';
import { openDb, runMigrations, type Db } from '../db.ts';
import { validateForPublish } from '../publication/validate.ts';
import type { NodezzleProject } from '../../../src/core/project/schema.ts';
import { blockRegistry } from '@/blocks';
import { definePort } from '@/core/types/ports';

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

interface NodeSpec {
  id: string;
  blockId: string;
  config?: Record<string, unknown>;
}
interface EdgeSpec {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
}

function doc(nodes: NodeSpec[], edges: EdgeSpec[], name = 'Схема'): NodezzleProject {
  return {
    formatVersion: 1,
    id: 'proj-pub',
    name,
    kind: 'telegram',
    canvas: {
      id: 'proj-pub:canvas',
      name,
      nodes: nodes.map((n) => ({ id: n.id, blockId: n.blockId, position: { x: 0, y: 0 }, config: n.config ?? {} })),
      edges,
    },
    models: [],
    variables: [],
    meta: { createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_001 },
  };
}

const textNode: NodeSpec = { id: 'n1', blockId: 'core.text' };
const outputNode: NodeSpec = { id: 'n2', blockId: 'core.output' };
const validEdge: EdgeSpec = { id: 'e1', source: 'n1', sourcePort: 'text', target: 'n2', targetPort: 'value' };

beforeAll(() => {
  // Тестовый блок с обязательным входом — проверить правило обязательных портов.
  blockRegistry.register({
    id: 'test.required',
    labelKey: 'test.required.label',
    descriptionKey: 'test.required.description',
    category: 'core',
    difficulty: 'basic',
    keywords: [],
    inputs: [definePort('in', 'test.required.in', 'data', 'any', { required: true })],
    outputs: [],
  });
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

describe('Валидация публикации (чистая функция)', () => {
  it('пустая схема — не публикуется', () => {
    const issues = validateForPublish(doc([], []));
    expect(issues.map((i) => i.code)).toContain('EMPTY_CANVAS');
  });

  it('корректная цепочка проходит без замечаний', () => {
    expect(validateForPublish(doc([textNode, outputNode], [validEdge]))).toEqual([]);
  });

  it('ребро к несуществующему узлу и неизвестный порт', () => {
    const broken: EdgeSpec[] = [
      { id: 'e2', source: 'n1', sourcePort: 'text', target: 'ghost', targetPort: 'value' },
      { id: 'e3', source: 'n1', sourcePort: 'нет-порта', target: 'n2', targetPort: 'value' },
    ];
    const codes = validateForPublish(doc([textNode, outputNode], broken)).map((i) => i.code);
    expect(codes).toContain('EDGE_TARGET_NODE');
    expect(codes).toContain('EDGE_UNKNOWN_SOURCE_PORT');
  });

  it('цикл отклоняется', () => {
    const a: NodeSpec = { id: 'a', blockId: 'core.text' };
    const b: NodeSpec = { id: 'b', blockId: 'core.text' };
    const edges: EdgeSpec[] = [
      { id: 'e1', source: 'a', sourcePort: 'text', target: 'b', targetPort: 'нет-порта' },
      { id: 'e2', source: 'b', sourcePort: 'text', target: 'a', targetPort: 'нет-порта' },
    ];
    const codes = validateForPublish(doc([a, b], edges)).map((i) => i.code);
    expect(codes).toContain('CYCLE');
  });

  it('неизвестный блок и неизвестная модель', () => {
    const issues = validateForPublish(doc([
      { id: 'x', blockId: 'nope.nope' },
      { id: 'y', blockId: 'core.text', config: { modelId: 'нет-такой' } },
    ], []));
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('MISSING_BLOCK');
    expect(codes).toContain('UNKNOWN_MODEL');
  });

  it('обязательный вход без ребра — проблема', () => {
    const codes = validateForPublish(doc([{ id: 'r', blockId: 'test.required' }], [])).map((i) => i.code);
    expect(codes).toContain('REQUIRED_INPUT_EMPTY');
  });
});

describe('Публикация через АПИ', () => {
  async function setup(): Promise<{ cookie: string; projectId: string }> {
    const reg = await api('POST', '/api/auth/register', { email: 'pub@example.ru', password: 'Пароль12345', name: 'Публика' });
    const cookie = cookieOf(reg);
    const list = (await (await api('GET', '/api/workspaces', undefined, cookie)).json()) as {
      workspaces: Array<{ id: string }>;
    };
    const created = await api('POST', '/api/projects', {
      workspaceId: list.workspaces[0].id,
      document: doc([textNode, outputNode], [validEdge]),
    }, cookie);
    const { project } = (await created.json()) as { project: { id: string } };
    return { cookie, projectId: project.id };
  }

  it('валидный проект публикуется; повторная публикация архивирует прежнюю', async () => {
    const { cookie, projectId } = await setup();

    const first = await api('POST', `/api/projects/${projectId}/publish`, {}, cookie);
    expect(first.status).toBe(201);
    const live = await api('GET', `/api/projects/${projectId}/live`, undefined, cookie);
    expect(live.status).toBe(200);
    const livePayload = (await live.json()) as { version: { status: string }; project: { canvas: { nodes: unknown[] } } };
    expect(livePayload.version.status).toBe('LIVE');
    expect(livePayload.project.canvas.nodes.length).toBe(2);

    // Черновик меняется, публикуем заново — прежняя LIVE уходит в архив.
    await api('PUT', `/api/projects/${projectId}`, {
      document: doc([textNode, outputNode], [validEdge], 'Обновлённая схема'),
    }, cookie);
    const second = await api('POST', `/api/projects/${projectId}/publish`, { label: 'Вторая' }, cookie);
    expect(second.status).toBe(201);

    const versions = (await (await api('GET', `/api/projects/${projectId}/versions`, undefined, cookie)).json()) as {
      versions: Array<{ status: string; label: string }>;
    };
    expect(versions.versions.filter((v) => v.status === 'LIVE')).toHaveLength(1);
    expect(versions.versions.filter((v) => v.status === 'ARCHIVED')).toHaveLength(1);
    const liveNow = (await (await api('GET', `/api/projects/${projectId}/live`, undefined, cookie)).json()) as {
      project: { name: string };
    };
    expect(liveNow.project.name).toBe('Обновлённая схема');
  });

  it('невалидная схема — 422 со списком проблем', async () => {
    const { cookie, projectId } = await setup();
    await api('PUT', `/api/projects/${projectId}`, {
      document: doc([textNode], [{ id: 'e', source: 'n1', sourcePort: 'text', target: 'ghost', targetPort: 'value' }]),
    }, cookie);
    const res = await api('POST', `/api/projects/${projectId}/publish`, {}, cookie);
    expect(res.status).toBe(422);
    const payload = (await res.json()) as { error: { code: string; details: { issues: Array<{ code: string }> } } };
    expect(payload.error.code).toBe('VALIDATION_FAILED');
    expect(payload.error.details.issues.map((i) => i.code)).toContain('EDGE_TARGET_NODE');
    // Публикация не создала версию.
    const versions = (await (await api('GET', `/api/projects/${projectId}/versions`, undefined, cookie)).json()) as {
      versions: unknown[];
    };
    expect(versions.versions).toEqual([]);
  });

  it('до публикации live не существует; чужой проект — 404', async () => {
    const { cookie, projectId } = await setup();
    expect((await api('GET', `/api/projects/${projectId}/live`, undefined, cookie)).status).toBe(404);
    const other = await api('POST', '/api/auth/register', { email: 'stranger@example.ru', password: 'Пароль12345', name: 'Ч' });
    const otherCookie = cookieOf(other);
    expect((await api('POST', `/api/projects/${projectId}/publish`, {}, otherCookie)).status).toBe(404);
    expect((await api('GET', `/api/projects/${projectId}/live`, undefined, otherCookie)).status).toBe(404);
  });
});
