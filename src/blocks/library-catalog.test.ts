/**
 * Автоматическая проверка каталога деталей (Этап 4).
 *
 * Фундаментальные инварианты библиотеки: уникальность, порты, типы,
 * статусы, сложность, русские названия, поиск и быстрая вставка.
 * Полный подсчёт «16 категорий × 10+» добавляется финальным аудитом (часть H).
 */

import '../blocks'; // регистрация всех блоков приложения
import ru from '@/i18n/locales/ru.json';

import { describe, expect, it } from 'vitest';
import { BLOCK_CATEGORIES, type BlockDefinition } from '@/core/types/blocks';
import { blockRegistry, effectiveStatus } from '@/core/registry/block-registry';
import { PORT_TYPE_COLORS } from '@/core/type-system/compatibility';
import { matchesQuery, quickInsertCandidates } from '@/features/canvas/library-utils';

const all: BlockDefinition[] = blockRegistry.list();
const ruBlocks = (ru as { blocks: Record<string, { label?: string; description?: string }> }).blocks;

describe('Каталог блоков — фундаментальные инварианты', () => {
  it('идентификаторы уникальны и имеют формат <категория>.<имя>', () => {
    const ids = all.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9_]+\.[a-z0-9_]+$/);
    }
  });

  it('категоры берутся из перечня BLOCK_CATEGORIES', () => {
    const known = new Set<string>(BLOCK_CATEGORIES);
    for (const b of all) {
      expect(known.has(b.category), `блок ${b.id}: неизвестная категория ${b.category}`).toBe(true);
    }
  });

  it('порты корректны: уникальные id по направлению, известные виды и типы', () => {
    for (const b of all) {
      const inIds = b.inputs.map((p) => p.id);
      const outIds = b.outputs.map((p) => p.id);
      expect(new Set(inIds).size, `блок ${b.id}: дубли входов`).toBe(inIds.length);
      expect(new Set(outIds).size, `блок ${b.id}: дубли выходов`).toBe(outIds.length);
      for (const p of [...b.inputs, ...b.outputs]) {
        expect(['data', 'event', 'error'], `блок ${b.id}, порт ${p.id}`).toContain(p.kind);
        expect(Object.keys(PORT_TYPE_COLORS), `блок ${b.id}, порт ${p.id}: тип ${p.type}`).toContain(p.type);
        if (p.kind === 'error') expect(p.type).toBe('error');
        if (p.kind === 'event') expect(p.type).toBe('event');
      }
    }
  });

  it('статусы корректны и не противоречат фактам', () => {
    const statuses = ['planned', 'prototype', 'implemented', 'experimental', 'deprecated'];
    for (const b of all) {
      if (b.status) expect(statuses, `блок ${b.id}`).toContain(b.status);
      // Скрытая деталь не может быть «реализованной» без явного статуса.
      expect(effectiveStatus(b), `блок ${b.id}`).not.toBe('');
      if (b.available === false && !b.status) {
        expect(effectiveStatus(b)).toBe('planned');
      }
    }
  });

  it('доступные детали имеют сложность, ключевые слова и русское название', () => {
    const cyrillic = /[а-яё]/i;
    for (const b of blockRegistry.available()) {
      expect(['basic', 'advanced'], `блок ${b.id}: сложность`).toContain(b.difficulty);
      expect((b.keywords ?? []).length, `блок ${b.id}: ключевые слова`).toBeGreaterThan(0);
      const entry = ruBlocks[b.id];
      expect(entry?.label, `блок ${b.id}: нет названия в ru.json`).toBeTruthy();
      const label = entry!.label!;
      // Название русское; допустимы устоявшиеся технические термины типа «JSON».
      const technical = /^[A-Z0-9 \-/]+$/.test(label) && label.length <= 8;
      expect(cyrillic.test(label) || technical, `блок ${b.id}: название не русское`).toBe(true);
      expect(entry?.description, `блок ${b.id}: нет описания в ru.json`).toBeTruthy();
      expect(cyrillic.test(entry!.description!), `блок ${b.id}: описание не русское`).toBe(true);
    }
  });

  it('нет неожиданных дубликатов: название + категория уникальны', () => {
    const seen = new Set<string>();
    for (const b of all) {
      const label = ruBlocks[b.id]?.label ?? b.id;
      const key = `${b.category}::${label}`;
      expect(seen.has(key), `дубль: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it('поиск библиотеки находит новые детали по-русски', () => {
    const texts = (b: BlockDefinition) => ({
      label: ruBlocks[b.id]?.label ?? '',
      description: ruBlocks[b.id]?.description ?? '',
    });
    const arrayLen = blockRegistry.get('data.array_length')!;
    expect(matchesQuery(arrayLen, 'длина массива', texts(arrayLen))).toBe(true);
    const gate = blockRegistry.get('flow.gate')!;
    expect(matchesQuery(gate, 'заслонка', texts(gate))).toBe(true);
    const compare = blockRegistry.get('logic.compare')!;
    expect(matchesQuery(compare, 'срав', texts(compare))).toBe(true);
  });

  it('быстрая вставка видит новые блоки через общий реестр и систему типов', () => {
    // Быстрая вставка получает список доступных деталей из общего реестра —
    // новых ручных каталогов не существует, поэтому достаточно проверки типов.
    const available = blockRegistry.available();
    // Выход «Массив» (константа) подходит входу «Длина массива».
    const fromCoreArray = quickInsertCandidates(available, { direction: 'output', kind: 'data', type: 'array' });
    expect(fromCoreArray.some((c) => c.def.id === 'data.array_length')).toBe(true);
    // Выход «Число» подходит входу «В диапазоне».
    const fromNumber = quickInsertCandidates(available, { direction: 'output', kind: 'data', type: 'number' });
    expect(fromNumber.some((c) => c.def.id === 'logic.in_range')).toBe(true);
    // Запланированные детали не просачиваются в доступные списки.
    const planned = all.filter((b) => b.available === false).map((b) => b.id);
    for (const id of planned) {
      expect(available.some((b) => b.id === id), `скрытый блок в доступных: ${id}`).toBe(false);
    }
  });
});
