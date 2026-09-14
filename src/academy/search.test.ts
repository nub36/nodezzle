/** Поиск помощи и контекстные подсказки (5.11F). */

import { describe, expect, it } from 'vitest';
import { lessons } from './catalog';
import { buildReference } from './reference';
import {
  buildHelpIndex,
  contextHelp,
  helpRouteForError,
  lessonForErrorCode,
  searchHelp,
} from './search';
import { blockRegistry } from '@/core/registry/block-registry';

// Мини-словарь: реальные ключи уроков + названия блоков из теста реестра.
const resolve = (key: string | undefined): string => {
  if (key === undefined) return '';
  const known: Record<string, string> = {
    'academy.lessons.intro-canvas.title': 'Знакомство с Canvas',
    'academy.lessons.intro-canvas.description': 'Холст, библиотека, инспектор.',
    'academy.lessons.basics-chain.title': 'Первая цепочка',
    'academy.lessons.telegram-first-bot.title': 'Первый Telegram-бот',
    'blocks.core.text.label': 'Текст',
    'blocks.core.text.description': 'Отдаёт текстовое значение.',
    'blocks.debug.log.label': 'Лог',
    'blocks.telegram.message_received.label': 'Получено сообщение',
  };
  return known[key] ?? key;
};

describe('Поиск помощи', () => {
  const reference = buildReference(blockRegistry.list());
  const index = buildHelpIndex(lessons, reference);

  it('индекс включает и уроки, и все детали справочника', () => {
    expect(index.filter((e) => e.kind === 'lesson').length).toBe(lessons.length);
    expect(index.filter((e) => e.kind === 'block').length).toBe(reference.length);
  });

  it('находит урок по названию', () => {
    const found = searchHelp(index, 'цепочка', resolve);
    expect(found.some((r) => r.entry.kind === 'lesson' && r.entry.id === 'basics-chain')).toBe(true);
  });

  it('находит деталь по ключевым словам и названию', () => {
    const byName = searchHelp(index, 'лог', resolve);
    expect(byName.some((r) => r.entry.kind === 'block' && r.entry.id === 'debug.log')).toBe(true);
  });

  it('короткий запрос (1 символ) не ищет', () => {
    expect(searchHelp(index, 'а', resolve)).toEqual([]);
    expect(searchHelp(index, '', resolve)).toEqual([]);
  });

  it('точное совпадение с начала названия выше по выдаче', () => {
    const found = searchHelp(index, 'текст', resolve);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].score).toBeGreaterThanOrEqual(found[found.length - 1].score);
  });

  it('неизвестный запрос — пустая выдача', () => {
    expect(searchHelp(index, 'абракадабра-нет-такого', resolve)).toEqual([]);
  });
});

describe('Контекстные подсказки', () => {
  it('пустой холст — урок про Canvas', () => {
    const out = contextHelp({ nodeCount: 0, hasSelection: false });
    expect(out.some((s) => s.to === '/academy/lesson/intro-canvas')).toBe(true);
  });

  it('схема есть, но не запускалась — урок первой цепочки', () => {
    const out = contextHelp({ nodeCount: 3, hasSelection: false });
    expect(out.some((s) => s.to === '/academy/lesson/basics-chain')).toBe(true);
  });

  it('ошибка выполнения — снова цепочка, выбрана деталь — справочник', () => {
    const out = contextHelp({ nodeCount: 3, hasSelection: true, lastRunStatus: 'error' });
    expect(out.some((s) => s.to === '/academy/lesson/basics-chain')).toBe(true);
    expect(out.some((s) => s.to === '/academy/reference')).toBe(true);
  });
});

describe('Ошибки как обучение', () => {
  it('каждый урок в подсказках реально существует в каталоге', () => {
    const codes = [
      'ERR_EMPTY_CANVAS', 'ERR_NO_TRIGGER', 'ERR_CYCLE',
      'ERR_INVALID_NUMBER', 'ERR_INVALID_JSON', 'ERR_MODEL_NOT_FOUND', 'ERR_MODEL_EXECUTION',
    ];
    for (const code of codes) {
      const target = lessonForErrorCode(code);
      if (target.kind === 'lesson') {
        expect(lessons.some((l) => l.id === target.id), code).toBe(true);
      }
    }
  });

  it('маршрут помощи всегда ведёт на существующую страницу', () => {
    expect(helpRouteForError('ERR_CYCLE')).toBe('/academy/lesson/basics-chain');
    expect(helpRouteForError('ERR_SOMETHING_UNKNOWN')).toBe('/academy/reference');
    expect(helpRouteForError(undefined)).toBe('/academy/reference');
  });
});
