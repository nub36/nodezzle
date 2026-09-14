/**
 * Справочник деталей Академии (5.11E).
 *
 * Строится АВТОМАТИЧЕСКИ из живого реестра блоков: второго списка
 * деталей не существует. Фильтрация/поиск — чистые функции, чтобы
 * их можно было тестировать и переиспользовать в глобальном поиске
 * помощи (5.11F).
 */

import type { BlockDefinition, BlockDifficulty, BlockStatus } from '@/core/types/blocks';
import type { PortDefinition } from '@/core/types/ports';
import { effectiveStatus } from '@/core/registry/block-registry';
import { lessonsForBlock } from './catalog';

/** Порт в справочнике: только то, что нужно пользователю. */
export interface ReferencePort {
  id: string;
  labelKey: string;
  kind: PortDefinition['kind'];
  type: string;
}

/** Карточка детали в справочнике. */
export interface ReferenceEntry {
  id: string;
  category: BlockDefinition['category'];
  labelKey: string;
  descriptionKey?: string;
  status: BlockStatus;
  difficulty: BlockDifficulty;
  trigger: boolean;
  icon?: string;
  keywords: string[];
  inputs: ReferencePort[];
  outputs: ReferencePort[];
  /** id уроков, связанных с деталью (перекрёстные ссылки). */
  lessonIds: string[];
}

function toPort(port: PortDefinition): ReferencePort {
  return { id: port.id, labelKey: port.labelKey, kind: port.kind, type: port.type };
}

/** Справочник из реестра: все определения, честный статус каждого. */
export function buildReference(
  defs: readonly BlockDefinition[],
): ReferenceEntry[] {
  return defs
    .map((def) => ({
      id: def.id,
      category: def.category,
      labelKey: def.labelKey,
      descriptionKey: def.descriptionKey,
      status: effectiveStatus(def),
      difficulty: def.difficulty ?? 'basic',
      trigger: def.trigger === true,
      icon: def.ui?.icon,
      keywords: def.keywords ?? [],
      inputs: def.inputs.map(toPort),
      outputs: def.outputs.map(toPort),
      lessonIds: lessonsForBlock(def.id).map((l) => l.id),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Фильтры справочника. */
export interface ReferenceFilters {
  category?: string; // id категории или 'all'
  difficulty?: 'all' | BlockDifficulty;
  status?: 'all' | BlockStatus;
  /** Поисковая строка: по названию, описанию, id и ключевым словам. */
  query?: string;
}

export interface ReferenceTextResolver {
  /** Разрешить i18n-ключ в текст (для поиска по содержимому). */
  (key: string | undefined): string;
}

/** Применить фильтры к справочнику (чистая функция). */
export function filterReference(
  entries: readonly ReferenceEntry[],
  filters: ReferenceFilters,
  resolve: ReferenceTextResolver,
): ReferenceEntry[] {
  const query = (filters.query ?? '').trim().toLowerCase();
  return entries.filter((entry) => {
    if (filters.category !== undefined && filters.category !== 'all' && entry.category !== filters.category) {
      return false;
    }
    if (filters.difficulty !== undefined && filters.difficulty !== 'all' && entry.difficulty !== filters.difficulty) {
      return false;
    }
    if (filters.status !== undefined && filters.status !== 'all' && entry.status !== filters.status) {
      return false;
    }
    if (query.length === 0) return true;
    const haystack = [
      resolve(entry.labelKey),
      entry.descriptionKey !== undefined ? resolve(entry.descriptionKey) : '',
      entry.id,
      ...entry.keywords,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

/** Категории, в которых реально есть детали (пустые не показываем). */
export function usedCategories(entries: readonly ReferenceEntry[]): string[] {
  const set = new Set(entries.map((e) => e.category));
  return [...set].sort();
}
