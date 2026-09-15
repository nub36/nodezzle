import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/blocks';
import { useProjectStore } from './project-store';
import { createDemoProject } from '@/demo/seed';
import { ServerSession, sameContent } from '@/core/project/server-session';
import { ServerDrafts } from '@/core/project/server-drafts';
import { projectStorage } from '@/core/project/storage';
function setup() {
  vi.useFakeTimers();
  const document = createDemoProject();
  const storage: Storage = { length: 0, key: () => null, getItem: () => null, setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() };
  const remote = { project: document, revision: 'a'.repeat(32), workspaceId: 'w', updatedAt: new Date().toISOString() };
  const save = vi.fn(async (project, _revision, _user) => ({ ...remote, project, revision: 'b'.repeat(32) }));
  const session = new ServerSession('u', remote, { save, load: vi.fn() }, async () => 'u', new ServerDrafts(storage));
  useProjectStore.getState().openServer(session);
  return { session, document, save, store: useProjectStore.getState() };
}
afterEach(() => {
  const state = useProjectStore.getState(); if (state.serverSession) state.closeServer(state.serverSession);
  vi.restoreAllMocks(); vi.useRealTimers();
});
describe('изолированный контекст серверного Canvas', () => {
  it('изменения активной модели попадают в полный документ; локальный адаптер не вызывается', async () => {
    const { session, document, store, save } = setup(); const localSave = vi.spyOn(projectStorage, 'save');
    store.openModel(document.models[0].id);
    store.setNodeConfig('gm_cond', 'value', 'Новая настройка');
    const draft = session.getSnapshot().document;
    expect(draft.canvas).toEqual(document.canvas);
    expect(draft.models[0].canvas.nodes.find((node) => node.id === 'gm_cond')?.config.value).toBe('Новая настройка');
    await store.saveNow(); expect(save).toHaveBeenCalledTimes(1); expect(localSave).not.toHaveBeenCalled();
    store.flushSave(); expect(localSave).not.toHaveBeenCalled();
    store.closeModel(); expect(useProjectStore.getState().nodes).toHaveLength(document.canvas.nodes.length);
  });
  it('ACK не сбрасывает активную модель, её новые правки или undo', async () => {
    const { session, document, store, save } = setup();
    let resolve!: (value: Awaited<ReturnType<typeof save>>) => void;
    save.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    store.renameProject('Первая'); const pending = store.saveNow(); await vi.advanceTimersByTimeAsync(0);
    store.openModel(document.models[0].id); store.setNodeConfig('gm_cond', 'value', 'Вторая');
    resolve({ project: document, revision: 'b'.repeat(32), workspaceId: 'w', updatedAt: new Date().toISOString() }); await pending;
    expect(useProjectStore.getState().activeModelId).toBe(document.models[0].id);
    expect(useProjectStore.getState().nodes.find((n) => n.id === 'gm_cond')?.data.config.value).toBe('Вторая');
    expect(useProjectStore.getState().past.length).toBeGreaterThan(0); expect(session.getSnapshot().status).toBe('dirty');
  });
  it('переход на локальный проект с тем же ID не сохраняет в сервер и старый cleanup не закрывает новый контекст', async () => {
    const { session, document, store, save } = setup();
    await projectStorage.save({ ...document, name: 'Локальный' });
    store.renameProject('Сервер'); store.flushSave();
    await store.loadById(document.id);
    store.closeServer(session);
    expect(useProjectStore.getState().project?.name).toBe('Локальный'); expect(useProjectStore.getState().serverSession).toBeNull();
    await vi.advanceTimersByTimeAsync(2000); expect(save).not.toHaveBeenCalled();
    await projectStorage.remove(document.id);
  });
  it('выход из неизменённого редактора не создаёт dirty из-за дат или порядка ключей', () => {
    const { session, store, document } = setup(); store.flushSave();
    expect(session.hasPending()).toBe(false);
    expect(sameContent(document, { ...document, meta: { ...document.meta, updatedAt: document.meta.updatedAt + 100 } })).toBe(true);
  });
});


it('неудачный переход на отсутствующий локальный проект не оставляет серверный документ под локальным save', async () => {
  const { session, store } = setup();
  const localSave = vi.spyOn(projectStorage, 'save');
  store.renameProject('Серверные данные');
  await store.loadById('missing-local-id');
  await store.saveNow();
  expect(useProjectStore.getState().project).toBeNull();
  expect(useProjectStore.getState().nodes).toEqual([]);
  expect(localSave).not.toHaveBeenCalled();
  store.closeServer(session);
});
