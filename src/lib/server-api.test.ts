/** Клиент серверного АПИ: относительные запросы, ошибки, метаданные. */

import { describe, expect, it } from 'vitest';
import { ApiClientError, createServerApi } from './server-api';

interface Recorded {
  path: string;
  method: string;
  body?: unknown;
}

function mockServer(handler: (req: Recorded) => { status: number; body: unknown }) {
  const recorded: Recorded[] = [];
  const fetchImpl = (async (input: string, init?: RequestInit) => {
    const req: Recorded = {
      path: input,
      method: init?.method ?? 'GET',
      body: init?.body !== undefined ? JSON.parse(init.body as string) : undefined,
    };
    recorded.push(req);
    const { status, body } = handler(req);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, recorded };
}

describe('createServerApi', () => {
  it('регистрация/вход идут на относительные пути без значений в URL', async () => {
    const { fetchImpl, recorded } = mockServer(() => ({ status: 200, body: { ok: true } }));
    const api = createServerApi(fetchImpl);
    await api.register('a@b.ru', 'Пароль12345', 'Имя');
    await api.login('a@b.ru', 'Пароль12345');
    expect(recorded.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /api/auth/register', 'POST /api/auth/login']);
    expect(recorded[0].body).toEqual({ email: 'a@b.ru', password: 'Пароль12345', name: 'Имя' });
  });

  it('распаковывает списки пространств, секретов и ботов', async () => {
    const { fetchImpl } = mockServer((req) => {
      if (req.path === '/api/workspaces') return { status: 200, body: { workspaces: [{ id: 'w1', name: 'Мои проекты' }] } };
      if (req.path === '/api/workspaces/w1/secrets') return { status: 200, body: { secrets: [{ id: 's1', name: 'TG' }] } };
      if (req.path === '/api/workspaces/w1/telegram-bots') return { status: 200, body: { bots: [{ id: 'b1', secretId: 's1' }] } };
      return { status: 404, body: {} };
    });
    const api = createServerApi(fetchImpl);
    expect((await api.workspaces())[0].name).toBe('Мои проекты');
    expect((await api.secrets('w1'))[0].id).toBe('s1');
    expect((await api.bots('w1'))[0].secretId).toBe('s1');
  });

  it('ошибка сервера превращается в ApiClientError с кодом и деталями', async () => {
    const { fetchImpl } = mockServer(() => ({
      status: 422,
      body: { error: { code: 'VALIDATION_FAILED', message: 'Схема не прошла проверку', details: { issues: [{ code: 'CYCLE' }] } } },
    }));
    const api = createServerApi(fetchImpl);
    try {
      await api.workspaces();
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      const apiErr = err as ApiClientError;
      expect(apiErr.status).toBe(422);
      expect(apiErr.code).toBe('VALIDATION_FAILED');
      expect(apiErr.details).toMatchObject({ issues: [{ code: 'CYCLE' }] });
    }
  });

  it('создание секрета и бота: значения уходят в теле, наружу — метаданные', async () => {
    const { fetchImpl, recorded } = mockServer((req) => {
      if (req.method === 'POST' && req.path.endsWith('/secrets')) {
        return { status: 201, body: { secret: { id: 's2', name: 'TG_TOKEN' } } };
      }
      if (req.method === 'POST' && req.path.endsWith('/telegram-bots')) {
        return { status: 201, body: { bot: { id: 'b2', secretId: 's2', webhookPath: 'x'.repeat(64) } } };
      }
      return { status: 200, body: {} };
    });
    const api = createServerApi(fetchImpl);
    const secret = await api.createSecret('w1', 'TG_TOKEN', 'секретное-значение');
    const bot = await api.createBot('w1', secret.id, null);
    expect(secret.id).toBe('s2');
    expect(bot.secretId).toBe('s2');
    // Ответы сервера не содержат значения токена — только метаданные.
    expect(JSON.stringify({ secret, bot })).not.toContain('секретное-значение');
    expect(recorded[0].body).toEqual({ name: 'TG_TOKEN', value: 'секретное-значение' });
    expect(recorded[1].body).toEqual({ secretId: 's2' });
  });

  it('замена секрета и отключение бота', async () => {
    const { fetchImpl, recorded } = mockServer((req) => {
      if (req.method === 'PATCH') return { status: 200, body: { bot: { id: 'b2', secretId: 's3' } } };
      if (req.method === 'DELETE') return { status: 200, body: { ok: true } };
      return { status: 404, body: {} };
    });
    const api = createServerApi(fetchImpl);
    const bot = await api.replaceBotSecret('w1', 'b2', 's3');
    await api.deleteBot('w1', 'b2');
    expect(bot.secretId).toBe('s3');
    expect(recorded.map((r) => `${r.method} ${r.path}`)).toEqual([
      'PATCH /api/workspaces/w1/telegram-bots/b2',
      'DELETE /api/workspaces/w1/telegram-bots/b2',
    ]);
  });

  it('история исполнений: фильтры и пагинация уходят в строку запроса', async () => {
    const { fetchImpl, recorded } = mockServer((req) => {
      if (req.path.endsWith('/steps')) return { status: 200, body: { steps: [{ sequence: 1, nodeId: 'n1' }] } };
      if (req.path.startsWith('/api/executions/')) return { status: 200, body: { execution: { id: 'e1' } } };
      return { status: 200, body: { executions: [{ id: 'e1', status: 'success' }] } };
    });
    const api = createServerApi(fetchImpl);

    const list = await api.executions('p1', { status: 'error', limit: 50, offset: 25 });
    expect(list).toHaveLength(1);
    expect(recorded[0].path).toBe('/api/projects/p1/executions?status=error&limit=50&offset=25');

    const run = await api.execution('e1');
    expect(run.id).toBe('e1');
    expect(recorded[1].path).toBe('/api/executions/e1');

    const steps = await api.executionSteps('e1');
    expect(steps[0].sequence).toBe(1);
    expect(recorded[2].path).toBe('/api/executions/e1/steps');
  });

  it('журнал действий: фильтр по группе и пагинация', async () => {
    const { fetchImpl, recorded } = mockServer(() => ({
      status: 200,
      body: { entries: [{ id: '1', action: 'project.publish' }] },
    }));
    const api = createServerApi(fetchImpl);

    const entries = await api.audit('w1', { action: 'project.', limit: 10, offset: 0 });
    expect(entries).toHaveLength(1);
    expect(recorded[0].path).toBe('/api/workspaces/w1/audit?action=project.&limit=10&offset=0');

    await api.audit('w1');
    expect(recorded[1].path).toBe('/api/workspaces/w1/audit');
  });
});
