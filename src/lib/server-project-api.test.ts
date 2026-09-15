import { describe, expect, it, vi } from 'vitest';
import { createServerProjectApi } from './server-project-api';
import { createDemoProject } from '@/demo/seed';
const previous = 'a'.repeat(32);
const next = 'b'.repeat(32);
const document = { ...createDemoProject(), id: 'project/1?' };
const saved = { project: document, revision: next, workspaceId: 'space', updatedAt: '2026-09-15T12:00:00.000Z' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe('ServerProjectApi', () => {
  it('GET сохраняет метаданные отдельно от документа', async () => {
    const fetch = vi.fn().mockResolvedValue(response(saved));
    expect(await createServerProjectApi(fetch).load(document.id)).toEqual(saved);
    expect(fetch).toHaveBeenCalledWith('/api/projects/project%2F1%3F', expect.objectContaining({ method: 'GET', credentials: 'same-origin' }));
    expect(saved.project).not.toHaveProperty('revision');
  });
  it('PUT/restore/DELETE отправляют только явно переданную ревизию, не выполняют предварительный GET/повторы', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(saved)).mockResolvedValueOnce(response(saved)).mockResolvedValueOnce(response({ ok: true }));
    const api = createServerProjectApi(fetch);
    expect(await api.save(document, previous)).toEqual(saved);
    expect(await api.restore(document.id, 'version/1?', previous)).toEqual(saved);
    await api.remove(document.id, next);
    expect(fetch.mock.calls.map(([url, init]) => [url, init.method, JSON.parse(init.body)])).toEqual([
      ['/api/projects/project%2F1%3F', 'PUT', { document, expectedRevision: previous }],
      ['/api/projects/project%2F1%3F/versions/version%2F1%3F/restore', 'POST', { expectedRevision: previous }],
      ['/api/projects/project%2F1%3F', 'DELETE', { expectedRevision: next }],
    ]);
    for (const [, init] of fetch.mock.calls) expect(init).toMatchObject({ credentials: 'same-origin', signal: expect.any(AbortSignal) });
  });
  it.each([401, 404, 409, 413, 428, 500])('ошибка %i остаётся ошибкой; повторного PUT нет', async (status) => {
    const fetch = vi.fn().mockResolvedValue(response({ error: { code: 'TEST', message: 'private' } }, status));
    await expect(createServerProjectApi(fetch).save(document, previous)).rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([{}, { ...saved, revision: undefined }, { ...saved, revision: 1 }, { ...saved, project: { ...document, id: 'other' } }, { ...saved, workspaceId: '' }])('старый или некорректный серверный ответ не готов для редактора', async (payload) => {
    await expect(createServerProjectApi(vi.fn().mockResolvedValue(response(payload))).load(document.id)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('подтверждение PUT с прежней ревизией не считается успехом', async () => {
    await expect(createServerProjectApi(vi.fn().mockResolvedValue(response({ ...saved, revision: previous }))).save(document, previous)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('некорректная исходная ревизия блокируется до fetch', async () => {
    const fetch = vi.fn(); const api = createServerProjectApi(fetch);
    await expect(api.save(document, '')).rejects.toMatchObject({ code: 'INVALID_REVISION' });
    await expect(api.restore(document.id, 'v', '*')).rejects.toMatchObject({ code: 'INVALID_REVISION' });
    await expect(api.remove(document.id, '*')).rejects.toMatchObject({ code: 'INVALID_REVISION' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('потеря ответа записи и некорректный DELETE не успех', async () => {
    const fetch = vi.fn().mockRejectedValue(new DOMException('Timeout', 'TimeoutError'));
    await expect(createServerProjectApi(fetch).save(document, previous)).rejects.toThrow('Timeout');
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(createServerProjectApi(vi.fn().mockResolvedValue(response({ ok: false }))).remove(document.id, previous)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
