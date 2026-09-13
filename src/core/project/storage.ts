/**
 * NODEZZLE — хранилище проектов (ProjectStorage).
 *
 * Интерфейс абстрагирует местоположение данных:
 *  - MVP: LocalStorageAdapter (браузер, Autosave без сервера);
 *  - будущее: ApiStorageAdapter (backend NODEZZLE, история версий).
 *
 * Подмена адаптера не затрагивает UI и runtime (см. docs/PROJECT_FORMAT.md).
 */

import type { NodezzleProject, ProjectSummary } from './schema';
import { tryParseProject } from './schema';

export interface ProjectStorage {
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<NodezzleProject | null>;
  save(project: NodezzleProject): Promise<void>;
  remove(id: string): Promise<void>;
}

const PREFIX = 'nodezzle.project.';

/** Адаптер поверх localStorage (MVP). setItem выполняется синхронно —
 *  это важно для flush при закрытии вкладки (beforeunload). */
export class LocalStorageAdapter implements ProjectStorage {
  constructor(private readonly storage: Storage) {}

  async list(): Promise<ProjectSummary[]> {
    const items: ProjectSummary[] = [];
    for (let i = 0; i < this.storage.length; i += 1) {
      const key = this.storage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      const project = await this.get(key.slice(PREFIX.length));
      if (project) {
        items.push({ id: project.id, name: project.name, kind: project.kind, updatedAt: project.meta.updatedAt });
      }
    }
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<NodezzleProject | null> {
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(PREFIX + id);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      return tryParseProject(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async save(project: NodezzleProject): Promise<void> {
    this.storage.setItem(PREFIX + project.id, JSON.stringify(project));
  }

  async remove(id: string): Promise<void> {
    this.storage.removeItem(PREFIX + id);
  }
}

function createDefaultAdapter(): ProjectStorage {
  if (typeof localStorage !== 'undefined') {
    return new LocalStorageAdapter(localStorage);
  }
  // Окружение без localStorage (тесты, SSR) — в памяти.
  const mem = new Map<string, string>();
  const memStorage: Storage = {
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
  return new LocalStorageAdapter(memStorage);
}

/** Глобальный адаптер приложения. */
export const projectStorage: ProjectStorage = createDefaultAdapter();
