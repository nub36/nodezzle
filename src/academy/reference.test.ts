/** Справочник деталей: строится из живого реестра, фильтры честные (5.11E). */

import { describe, expect, it } from 'vitest';
import { blockRegistry } from '@/core/registry/block-registry';
import { buildReference, filterReference, usedCategories } from './reference';

const resolve = (key: string | undefined): string => {
  // Мини-словарь для поиска: в тесте важнее механика, чем полные тексты.
  const known: Record<string, string> = {
    'blocks.core.text.label': 'Текст',
    'blocks.core.text.description': 'Отдаёт текстовое значение.',
    'blocks.debug.log.label': 'Лог',
    'blocks.telegram.message_received.label': 'Получено сообщение',
  };
  return key !== undefined ? (known[key] ?? key) : '';
};

describe('Справочник деталей', () => {
  const entries = buildReference(blockRegistry.list());

  it('в справочнике каждая деталь реестра — второго списка нет', () => {
    expect(entries.length).toBe(blockRegistry.list().length);
    for (const entry of entries) {
      expect(blockRegistry.has(entry.id)).toBe(true);
    }
  });

  it('статус каждой детали совпадает с фактическим статусом реестра', () => {
    for (const entry of entries) {
      const def = blockRegistry.get(entry.id);
      expect(def).toBeDefined();
      // planned — только если исполнения нет/деталь скрыта (или явно указан).
      if (entry.status === 'planned' && def !== undefined) {
        expect(def.status === 'planned' || def.available === false || !def.runtime).toBe(true);
      }
    }
  });

  it('запланированные детали помечены явно, реализованных большинство', () => {
    const planned = entries.filter((e) => e.status === 'planned');
    const implemented = entries.filter((e) => e.status === 'implemented');
    expect(planned.length).toBeGreaterThan(0);
    expect(implemented.length).toBeGreaterThan(planned.length);
  });

  it('фильтр по категории оставляет только её детали', () => {
    const coreOnly = filterReference(entries, { category: 'core' }, resolve);
    expect(coreOnly.length).toBeGreaterThan(0);
    expect(coreOnly.every((e) => e.category === 'core')).toBe(true);
  });

  it('фильтр по статусу «запланировано» не пропускает работающие детали', () => {
    const plannedOnly = filterReference(entries, { status: 'planned' }, resolve);
    expect(plannedOnly.every((e) => e.status === 'planned')).toBe(true);
    expect(plannedOnly.length).toBe(entries.filter((e) => e.status === 'planned').length);
  });

  it('фильтр по сложности', () => {
    const advanced = filterReference(entries, { difficulty: 'advanced' }, resolve);
    expect(advanced.every((e) => e.difficulty === 'advanced')).toBe(true);
  });

  it('поиск находит по названию, ключевым словам и id', () => {
    const byLabel = filterReference(entries, { query: 'текст' }, resolve);
    expect(byLabel.some((e) => e.id === 'core.text')).toBe(true);
    const byId = filterReference(entries, { query: 'core.text' }, resolve);
    expect(byId.some((e) => e.id === 'core.text')).toBe(true);
    const nothing = filterReference(entries, { query: 'нет-такой-детали' }, resolve);
    expect(nothing).toEqual([]);
  });

  it('фильтры комбинируются', () => {
    const combo = filterReference(
      entries,
      { category: 'core', status: 'implemented', query: 'текст' },
      resolve,
    );
    expect(combo.every((e) => e.category === 'core' && e.status === 'implemented')).toBe(true);
  });

  it('у детали со связанным уроком в справочнике виден урок', () => {
    const text = entries.find((e) => e.id === 'core.text');
    expect(text).toBeDefined();
    expect(text?.lessonIds.length ?? 0).toBeGreaterThan(0);
  });

  it('категории без деталей не показываются', () => {
    const used = usedCategories(entries);
    expect(used.length).toBeGreaterThan(0);
    expect(new Set(entries.map((e) => e.category)).size).toBe(used.length);
  });
});
