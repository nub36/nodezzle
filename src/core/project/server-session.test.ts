import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ServerSession } from './server-session';
import { ServerDrafts } from './server-drafts';
import { createDemoProject } from '@/demo/seed';
import { ApiClientError } from '@/lib/server-api';
import type { ServerProjectDocument } from '@/lib/server-project-api';
function memory(): Storage {
  const map = new Map<string, string>();
  return { get length() { return map.size; }, key: (i) => [...map.keys()][i] ?? null, getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); }, clear: () => map.clear() };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { resolve, promise }; }
const original: ServerProjectDocument = { project: createDemoProject(), revision: 'a'.repeat(32), workspaceId: 'w', updatedAt: new Date().toISOString() };
function setup() {
  const raw = memory(), drafts = new ServerDrafts(raw);
  const load = vi.fn().mockResolvedValue(original);
  const save = vi.fn(async (document, _revision, _user) => ({ ...original, project: document, revision: 'b'.repeat(32) }));
  const user = vi.fn().mockResolvedValue('u');
  const session = new ServerSession('u', original, { load, save }, user, drafts);
  return { raw, drafts, save, load, user, session };
}
beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers());
describe('серверная сессия редактора', () => {
  it('дебаунс объединяет правки; резерв пишется сразу, успех — только после ACK', async () => {
    const { session, drafts, save } = setup();
    session.edit({ ...original.project, name: 'А' }); session.edit({ ...original.project, name: 'Б' });
    expect(save).not.toHaveBeenCalled(); expect(drafts.list('u', original.project.id, 'w')[0].draft.document.name).toBe('Б');
    await vi.advanceTimersByTimeAsync(900);
    expect(save).toHaveBeenCalledTimes(1); expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Б' }), original.revision, 'u');
    expect(session.getSnapshot().status).toBe('saved'); expect(drafts.list('u', original.project.id, 'w')).toEqual([]);
  });
  it('правка во время запроса не теряется и не получает преждевременное «сохранено»', async () => {
    const { session, save, drafts } = setup(); const response = deferred<ServerProjectDocument>(); save.mockImplementationOnce(() => response.promise);
    session.edit({ ...original.project, name: 'А' }); const pending = session.flush(); await Promise.resolve();
    session.edit({ ...original.project, name: 'Б' }); await session.flush(); expect(save).toHaveBeenCalledTimes(1);
    response.resolve({ ...original, project: { ...original.project, name: 'А' }, revision: 'b'.repeat(32) }); await pending;
    expect(session.getSnapshot()).toMatchObject({ status: 'dirty', document: { name: 'Б' } });
    expect(drafts.list('u', original.project.id, 'w')[0].draft.revision).toBe('b'.repeat(32));
    await vi.advanceTimersByTimeAsync(900);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Б' }), 'b'.repeat(32), 'u');
  });
  it.each([401, 404, 409, 413, 500])('ошибка %i сохраняет черновик и останавливает повторы', async (status) => {
    const { session, save, drafts } = setup(); save.mockRejectedValue(new ApiClientError(status, 'TEST', 'internal'));
    session.edit({ ...original.project, name: 'Моё' }); await session.flush();
    session.edit({ ...original.project, name: 'Ещё' }); await vi.advanceTimersByTimeAsync(10000); await session.flush();
    expect(save).toHaveBeenCalledTimes(1); expect(session.getSnapshot().status).toBe('paused');
    expect(drafts.list('u', original.project.id, 'w')[0].draft.document.name).toBe('Ещё');
  });
  it('потерянный ответ: GET подтверждает именно мои данные без второго PUT', async () => {
    const { session, save, load, drafts } = setup(); save.mockRejectedValue(new Error('offline'));
    const document = { ...original.project, name: 'Моё' }; session.edit(document); await session.flush();
    load.mockResolvedValue({ ...original, project: document, revision: 'b'.repeat(32) }); await session.inspect();
    expect(session.getSnapshot().status).toBe('saved'); expect(save).toHaveBeenCalledTimes(1);
    expect(drafts.list('u', document.id, 'w')).toEqual([]);
  });
  it('просмотр конфликта не пишет; подтверждённая замена использует просмотренную ревизию', async () => {
    const { session, save, load } = setup(); session.edit({ ...original.project, name: 'Моё' });
    load.mockResolvedValue({ ...original, revision: 'c'.repeat(32), project: { ...original.project, name: 'Чужое' } });
    await session.inspect(); expect(save).not.toHaveBeenCalled();
    expect(session.getSnapshot().error).toBe('conflict'); await session.keepMine();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Моё' }), 'c'.repeat(32), 'u');
  });
  it('принятие сервера сбрасывает текущий резерв, не пишет PUT и возвращает документ', async () => {
    const { session, save, load, drafts } = setup(); session.edit({ ...original.project, name: 'Моё' });
    const remote = { ...original, project: { ...original.project, name: 'Сервер' }, revision: 'c'.repeat(32) };
    load.mockResolvedValue(remote); await session.inspect(); expect(session.acceptRemote()).toEqual(remote.project);
    expect(session.getSnapshot().status).toBe('saved'); expect(save).not.toHaveBeenCalled(); expect(drafts.list('u', original.project.id, 'w')).toEqual([]);
  });
  it('поздний ACK после ухода не удаляет резерв и не отправляет очередь', async () => {
    const { session, save, drafts } = setup(); const response = deferred<ServerProjectDocument>(); save.mockImplementationOnce(() => response.promise);
    session.edit({ ...original.project, name: 'Моё' }); const pending = session.flush(); await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1); session.dispose(); response.resolve({ ...original, revision: 'b'.repeat(32) }); await pending; await vi.advanceTimersByTimeAsync(10000);
    expect(save).toHaveBeenCalledTimes(1); expect(drafts.list('u', original.project.id, 'w')).toHaveLength(1);
  });
  it('новый аккаунт и pause во время me блокируют PUT', async () => {
    const { session, save, user } = setup(); user.mockResolvedValue('other');
    session.edit({ ...original.project, name: 'Моё' }); await session.flush(); expect(save).not.toHaveBeenCalled(); expect(session.getSnapshot().error).toBe('auth');
    const second = setup(); const who = deferred<string>(); second.user.mockReturnValue(who.promise);
    second.session.edit({ ...original.project, name: 'Ещё' }); const pending = second.session.flush(); second.session.pause(); who.resolve('u'); await pending;
    expect(second.save).not.toHaveBeenCalled();
  });
  it('поздний GET после смены контекста не разрешает замену', async () => {
    const { session, load } = setup(); const remote = deferred<ServerProjectDocument>(); load.mockReturnValue(remote.promise);
    const pending = session.inspect(); await Promise.resolve(); session.pause(); remote.resolve(original); await pending;
    expect(session.getSnapshot().remote).toBeNull(); expect(session.getSnapshot().status).toBe('paused');
  });
  it('квота видна, но не мешает подтверждённому серверному сохранению', async () => {
    const { raw, session, save } = setup(); raw.setItem = () => { throw new Error('quota'); };
    session.edit({ ...original.project, name: 'Моё' }); expect(session.getSnapshot().backupError).toBe(true);
    await session.flush(); expect(save).toHaveBeenCalledTimes(1); expect(session.getSnapshot().status).toBe('saved');
  });
  it('черновики двух вкладок независимы, фильтруются по владельцу/пространству/проекту', () => {
    const { session, drafts, save, user } = setup();
    const other = new ServerSession('u', original, { load: vi.fn(), save }, user, drafts);
    session.edit({ ...original.project, name: 'А' }); other.edit({ ...original.project, name: 'Б' });
    expect(drafts.list('u', original.project.id, 'w')).toHaveLength(2);
    expect(drafts.list('other', original.project.id, 'w')).toEqual([]); expect(drafts.list('u', original.project.id, 'other')).toEqual([]);
    session.dispose(); expect(drafts.list('u', original.project.id, 'w')).toHaveLength(2);
  });
  it('восстановление не отправляется само и не допускает чужие/учебные документы', async () => {
    const { session, save } = setup(); const draft = { version: 1 as const, userId: 'u', workspaceId: 'w', revision: original.revision, document: { ...original.project, name: 'Черновик' }, updatedAt: 1 };
    session.recover(draft); await vi.advanceTimersByTimeAsync(2000); expect(save).not.toHaveBeenCalled();
    expect(() => session.recover({ ...draft, userId: 'other' })).toThrow();
    expect(() => new ServerSession('u', { ...original, project: { ...original.project, meta: { ...original.project.meta, tutorial: { lessonId: 'ports' } } } }, { load: vi.fn(), save }, vi.fn(), new ServerDrafts(memory()))).toThrow();
  });
});

it('плохие JSON/форматы и чужие записи резерва не применяются и не стираются', () => {
  const { raw, drafts } = setup();
  raw.setItem('nodezzle.server-draft.bad', '{broken');
  raw.setItem('nodezzle.server-draft.future', JSON.stringify({ version: 99 }));
  expect(drafts.list('u', original.project.id)).toEqual([]); expect(raw.length).toBe(2);
  expect(() => drafts.put('nodezzle.project.wrong', { version: 1, userId: 'u', workspaceId: 'w', revision: original.revision, document: original.project, updatedAt: 1 })).toThrow();
});
