import { describe, it, expect, vi } from 'vitest';
import { createProjectApi } from './project-api';
import { createDemoProject } from '@/demo/seed';
const timestamp = '2026-09-15T12:00:00.000Z';
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
describe('ProjectApi: same-origin, только новые записи, валидация границы', () => {
  it('me/workspaces/list/get и кодирование ID', async () => {
    const doc = { ...createDemoProject(), id: 'a/b?' };
    const fetch = vi.fn().mockResolvedValueOnce(reply({ user: { id: 'u', name: 'Имя', email: 'test@example.invalid' } }))
      .mockResolvedValueOnce(reply({ workspaces: [{ id: 'w/a', name: 'Мои' }] }))
      .mockResolvedValueOnce(reply({ projects: [{ id: doc.id, name: doc.name, kind: doc.kind, updatedAt: timestamp }] }))
      .mockResolvedValueOnce(reply({ project: doc, updatedAt: timestamp }));
    const api = createProjectApi(fetch);
    expect((await api.me()).id).toBe('u'); expect((await api.workspaces())[0].id).toBe('w/a');
    expect(await api.list('w/a')).toHaveLength(1); expect(await api.get(doc.id)).toEqual(doc);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(['/api/auth/me', '/api/workspaces', '/api/workspaces/w%2Fa/projects', '/api/projects/a%2Fb%3F']);
    for (const [, init] of fetch.mock.calls) expect(init).toMatchObject({ credentials: 'same-origin', method: 'GET', signal: expect.any(AbortSignal) });
  });
  it('POST получает подтверждение того же ID; нет PUT или повторов', async () => {
    const document = createDemoProject();
    const fetch = vi.fn().mockResolvedValue(reply({ project: document, updatedAt: timestamp }, 201));
    expect(await createProjectApi(fetch).create('w', document)).toEqual(document);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toEqual(['/api/projects', expect.objectContaining({ method: 'POST', body: JSON.stringify({ workspaceId: 'w', document }) })]);
  });
  it.each([401, 403, 404, 409, 413, 429, 500])('ошибка %i не успех и не автоматический повтор', async (status) => {
    const fetch = vi.fn().mockResolvedValue(reply({ error: { code: 'TEST', message: 'internal private text' } }, status));
    await expect(createProjectApi(fetch).create('w', createDemoProject())).rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([null, {}, { projects: [{ updatedAt: 'bad' }] }])('неверный список отклоняется: %j', async (raw) => {
    await expect(createProjectApi(vi.fn().mockResolvedValue(reply(raw))).list('w')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('неверный формат и ID документа не принимаются', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply({ project: { ...createDemoProject(), formatVersion: 2 }, updatedAt: timestamp }))
      .mockResolvedValueOnce(reply({ project: createDemoProject(), updatedAt: timestamp }))
      .mockResolvedValueOnce(reply({ project: { ...createDemoProject(), id: 'wrong' }, updatedAt: timestamp }));
    const api = createProjectApi(fetch);
    await expect(api.get('x')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(api.get('x')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(api.create('w', createDemoProject())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('HTML вместо JSON не считается проектом', async () => {
    await expect(createProjectApi(vi.fn().mockResolvedValue(new Response('<html/>'))).get('x')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('logout требует ok; потеря сети/таймаут не повторяет POST', async () => {
    await expect(createProjectApi(vi.fn().mockResolvedValue(reply({ ok: false }))).logout()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    const fetch = vi.fn().mockRejectedValue(new DOMException('Timeout', 'TimeoutError'));
    await expect(createProjectApi(fetch).create('w', createDemoProject())).rejects.toThrow('Timeout');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
