import { describe, expect, it } from 'vitest';
import { LocalStorageAdapter } from './storage';
import { createDemoProject } from '@/demo/seed';
import type { NodezzleProject } from './schema';

/** In-memory фалб Storage для тестов. */
function createMemoryStorage(): Storage {
  const mem = new Map<string, string>();
  return {
    get length() {
      return mem.size;
    },
    clear: () => mem.clear(),
    getItem: (k) => (mem.has(k) ? mem.get(k)! : null),
    key: (i) => [...mem.keys()][i] ?? null,
    removeItem: (k) => {
      mem.delete(k);
    },
    setItem: (k, v) => {
      mem.set(k, String(v));
    },
  };
}

describe('LocalStorageAdapter (ProjectStorage)', () => {
  it('save → get → list → remove', async () => {
    const storage = new LocalStorageAdapter(createMemoryStorage());
    const project = createDemoProject();

    await storage.save(project);
    const loaded = await storage.get(project.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.name).toBe(project.name);
    expect(loaded?.models).toHaveLength(1);

    const list = await storage.list();
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe('telegram');

    await storage.remove(project.id);
    expect(await storage.get(project.id)).toBeNull();
    expect(await storage.list()).toHaveLength(0);
  });

  it('повреждённый JSON не ломает get (возвращает null)', async () => {
    const raw = createMemoryStorage();
    raw.setItem('nodezzle.project.bad', '{ это не json');
    const storage = new LocalStorageAdapter(raw);
    expect(await storage.get('bad')).toBeNull();
    expect(await storage.list()).toHaveLength(0);
  });

  it('несоответствующий формату проект отклоняется (tryParse)', async () => {
    const raw = createMemoryStorage();
    const bad = { formatVersion: 99, id: 'x', name: 'y' };
    raw.setItem('nodezzle.project.bad', JSON.stringify(bad));
    const storage = new LocalStorageAdapter(raw);
    expect(await storage.get('bad')).toBeNull();
  });

  it('сортировка списка: свежие проекты выше', async () => {
    const raw = createMemoryStorage();
    const storage = new LocalStorageAdapter(raw);
    const a: NodezzleProject = createDemoProject();
    const b: NodezzleProject = { ...createDemoProject(), id: 'b', name: 'B', meta: { createdAt: 5, updatedAt: 100 } };
    a.meta = { createdAt: 1, updatedAt: 50 };
    await storage.save(a);
    await storage.save(b);
    const list = await storage.list();
    expect(list.map((p) => p.id)).toEqual([b.id, a.id]);
  });
});
