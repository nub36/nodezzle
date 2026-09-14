/** Каталог уроков: целостность, реестр, i18n-ключи (5.11D). */

import { describe, expect, it } from 'vitest';
import { blockRegistry } from '@/core/registry/block-registry';
import { catalogErrors, getLesson, lessons, lessonsForBlock } from './catalog';
import ru from '@/i18n/locales/ru.json';

function lookup(path: string): unknown {
  let cur: unknown = ru;
  for (const part of path.split('.')) {
    if (typeof cur !== 'object' || cur === null || !(part in cur)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

describe('Каталог Академии', () => {
  it('каталог валиден относительно живого реестра блоков', () => {
    expect(catalogErrors()).toEqual([]);
  });

  it('базовый курс — минимум 10 интерактивных уроков', () => {
    expect(lessons.length).toBeGreaterThanOrEqual(10);
  });

  it('идентификаторы уроков уникальны', () => {
    const ids = lessons.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('идентификаторы шагов уникальны внутри урока', () => {
    for (const lesson of lessons) {
      const ids = lesson.steps.map((s) => s.id);
      expect(new Set(ids).size, `урок ${lesson.id}`).toBe(ids.length);
    }
  });

  it('все блоки шагов существуют в реальном реестре', () => {
    // Отдельная страховка поверх валидатора: собираем ВСЕ ссылки на блоки.
    for (const lesson of lessons) {
      for (const step of lesson.steps) {
        const refs: string[] = [];
        if (step.kind === 'add-block' || step.kind === 'select-block' || step.kind === 'configure') {
          refs.push(step.blockId);
        }
        if (step.kind === 'connect') refs.push(step.fromBlockId, step.toBlockId);
        for (const id of refs) {
          expect(blockRegistry.has(id), `${lesson.id}:${step.id} → ${id}`).toBe(true);
        }
      }
    }
  });

  it('все тексты урока имеют i18n-ключи (ничего пустого на экране)', () => {
    const missing: string[] = [];
    for (const lesson of lessons) {
      for (const key of [lesson.titleKey, lesson.descriptionKey]) {
        if (lookup(key) === undefined) missing.push(`${lesson.id}: ${key}`);
      }
      for (const step of lesson.steps) {
        const keys: Array<string | undefined> = [step.titleKey, step.textKey, step.hintKey, step.detailsKey];
        if (step.kind === 'quiz') {
          keys.push(step.questionKey);
          keys.push(...step.options.map((o) => o.labelKey));
        }
        for (const key of keys) {
          if (key === undefined) continue;
          const value = lookup(key);
          if (typeof value !== 'string' || value.length === 0) {
            missing.push(`${lesson.id}:${step.id} → ${key}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('инструкции всех 12 уроков компактны, теория вынесена отдельно', () => {
    for (const lesson of lessons) {
      expect(String(lookup(lesson.descriptionKey)).length, lesson.id).toBeLessThanOrEqual(120);
      for (const step of lesson.steps) {
        expect(String(lookup(step.textKey)).length, `${lesson.id}:${step.id}`).toBeLessThanOrEqual(220);
        if (step.detailsKey !== undefined) {
          expect(step.detailsKey).not.toBe(step.textKey);
          expect(String(lookup(step.detailsKey)).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('викторины содержат правильный ответ', () => {
    for (const lesson of lessons) {
      for (const step of lesson.steps) {
        if (step.kind === 'quiz') {
          expect(step.options.some((o) => o.correct), `${lesson.id}:${step.id}`).toBe(true);
        }
      }
    }
  });

  it('getLesson находит урок, отсутствующий вернёт пустоту', () => {
    expect(getLesson('intro-what')).toBeDefined();
    expect(getLesson('no.such-lesson')).toBeUndefined();
  });

  it('lessonsForBlock связывает деталь с уроками через relatedBlockIds', () => {
    const linked = lessonsForBlock('core.text');
    expect(linked.length).toBeGreaterThan(0);
    expect(linked.some((l) => l.id === 'intro-canvas')).toBe(true);
    expect(lessonsForBlock('no.such-block')).toEqual([]);
  });

  it('prerequisites образуют цепочку по уровням без ссылок вперёд', () => {
    const index = new Map(lessons.map((l, i) => [l.id, i]));
    for (const lesson of lessons) {
      for (const prereq of lesson.prerequisites) {
        const prev = index.get(prereq);
        expect(prev, `${lesson.id} → ${prereq}`).toBeDefined();
        if (prev !== undefined) expect(prev).toBeLessThan(index.get(lesson.id) as number);
      }
    }
  });
});
