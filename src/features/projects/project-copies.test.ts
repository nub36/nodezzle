import { describe, it, expect, vi } from 'vitest';
import { createDemoProject } from '@/demo/seed';
import type { ProjectStorage } from '@/core/project/storage';
import { newProjectCopy, restoreProjectCopy, uploadProjectCopy } from './project-copies';
import { copyErrorKey } from './ServerProjectsPanel';
import { ApiClientError } from '@/lib/server-api';
function storage(): ProjectStorage {
  return { get: vi.fn().mockResolvedValue(null), save: vi.fn().mockResolvedValue(undefined), list: vi.fn().mockResolvedValue([]), remove: vi.fn() };
}
describe('явные копии проектов', () => {
  it('новый root ID/даты; внутренние ID, модели, ссылки, поля, группы не переназначаются', () => {
    const source = createDemoProject();
    source.canvas.groups = [{ id: 'group', label: 'Группа', nodeIds: [source.canvas.nodes[0].id] }];
    source.canvas.viewport = { x: 10, y: 20, zoom: 0.75 };
    source.variables = [{ id: 'v', name: 'v', type: 'object', scope: 'project', value: { a: [1, 2] } }];
    source.canvas.nodes[0].config = { formNodeId: 'form', arbitrary: { a: 1 } };
    const before = structuredClone(source);
    const copy = newProjectCopy(source, 'fresh', 42);
    expect(copy).toEqual({ ...source, id: 'fresh', meta: { createdAt: 42, updatedAt: 42 } });
    expect(copy.models).not.toBe(source.models); expect(copy.canvas.nodes[0].config).not.toBe(source.canvas.nodes[0].config);
    (copy.variables[0].value as { a: number[] }).a.push(3);
    expect(source).toEqual(before);
  });
  it('невалидный документ и прежний ID отклоняются', () => {
    expect(() => newProjectCopy({})).toThrow('INVALID_PROJECT');
    const source = createDemoProject(); expect(() => newProjectCopy(source, source.id)).toThrow('INVALID_PROJECT');
  });
  it('песочница отклоняется независимо от карточки и направления', async () => {
    const source = createDemoProject(); source.meta.tutorial = { lessonId: 'ports' };
    const local = storage(); vi.mocked(local.get).mockResolvedValue(source);
    const create = vi.fn(); const get = vi.fn().mockResolvedValue(source);
    await expect(uploadProjectCopy({ create }, local, 'w', source.id, () => true)).rejects.toThrow('TUTORIAL_PROJECT');
    await expect(restoreProjectCopy({ get }, local, source.id, () => true)).rejects.toThrow('TUTORIAL_PROJECT');
    expect(create).not.toHaveBeenCalled(); expect(local.save).not.toHaveBeenCalled(); expect(source.meta.tutorial).toEqual({ lessonId: 'ports' });
  });
  it('upload читает свежий локальный документ, только создаёт на сервере и не трогает storage', async () => {
    const source = createDemoProject(); const local = storage(); vi.mocked(local.get).mockResolvedValue(source);
    const create = vi.fn(async (_w, copy) => copy);
    const a = await uploadProjectCopy({ create }, local, 'w', source.id, () => true);
    const b = await uploadProjectCopy({ create }, local, 'w', source.id, () => true);
    expect(a.id).not.toBe(source.id); expect(a.id).not.toBe(b.id); expect(create).toHaveBeenCalledWith('w', a);
    expect(local.save).not.toHaveBeenCalled(); expect(local.remove).not.toHaveBeenCalled();
  });
  it('отсутствие локального проекта и сбой чтения не отправляют POST', async () => {
    const local = storage(); const create = vi.fn();
    await expect(uploadProjectCopy({ create }, local, 'w', 'missing', () => true)).rejects.toThrow('LOCAL_READ');
    vi.mocked(local.get).mockRejectedValue(new Error('blocked'));
    await expect(uploadProjectCopy({ create }, local, 'w', 'missing', () => true)).rejects.toThrow('LOCAL_READ');
    expect(create).not.toHaveBeenCalled();
  });
  it('restore создаёт новый локальный документ и ждёт успешного save', async () => {
    const source = createDemoProject(); const local = storage(); const get = vi.fn().mockResolvedValue(source);
    const result = await restoreProjectCopy({ get }, local, source.id, () => true);
    expect(result.id).not.toBe(source.id); expect(result.canvas).toEqual(source.canvas);
    expect(local.save).toHaveBeenCalledWith(result); expect(local.remove).not.toHaveBeenCalled();
  });
  it('ошибка сети не пишет локально; ошибка квоты не успех', async () => {
    const source = createDemoProject(); const local = storage();
    await expect(restoreProjectCopy({ get: vi.fn().mockRejectedValue(new Error('offline')) }, local, source.id, () => true)).rejects.toThrow('offline');
    expect(local.save).not.toHaveBeenCalled();
    vi.mocked(local.save).mockRejectedValue(new DOMException('full', 'QuotaExceededError'));
    await expect(restoreProjectCopy({ get: vi.fn().mockResolvedValue(source) }, local, source.id, () => true)).rejects.toThrow('LOCAL_WRITE');
  });
  it('коллизия локального ID не перезаписывает документ', async () => {
    const local = storage(); vi.mocked(local.get).mockResolvedValue(createDemoProject());
    await expect(restoreProjectCopy({ get: vi.fn().mockResolvedValue(createDemoProject()) }, local, createDemoProject().id, () => true)).rejects.toThrow('LOCAL_WRITE');
    expect(local.save).not.toHaveBeenCalled();
  });
  it('поздний серверный ответ после смены контекста не пишет в браузер', async () => {
    let current = true; const local = storage();
    const get = vi.fn(async () => { current = false; return createDemoProject(); });
    await expect(restoreProjectCopy({ get }, local, createDemoProject().id, () => current)).rejects.toThrow('STALE_OPERATION');
    expect(local.get).not.toHaveBeenCalled(); expect(local.save).not.toHaveBeenCalled();
  });
  it('смена контекста во время local.get блокирует restore/save и upload/POST', async () => {
    let current = true; const local = storage();
    vi.mocked(local.get).mockImplementation(async () => { current = false; return null; });
    await expect(restoreProjectCopy({ get: vi.fn().mockResolvedValue(createDemoProject()) }, local, createDemoProject().id, () => current)).rejects.toThrow('STALE_OPERATION');
    expect(local.save).not.toHaveBeenCalled();
    current = true; const create = vi.fn();
    vi.mocked(local.get).mockImplementation(async () => { current = false; return createDemoProject(); });
    await expect(uploadProjectCopy({ create }, local, 'w', 'x', () => current)).rejects.toThrow('STALE_OPERATION');
    expect(create).not.toHaveBeenCalled();
  });
  it('UI не выводит серверный message с внутренними данными', () => {
    expect(copyErrorKey(new ApiClientError(500, 'internal', 'sensitive'))).toBe('serverProjects.errors.network');
    expect(copyErrorKey(new ApiClientError(413, 'large', 'sensitive'))).toBe('serverProjects.errors.large');
  });
});
