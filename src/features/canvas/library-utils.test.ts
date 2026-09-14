/**
 * Тесты чистых помощников библиотеки деталей (Этап 2, подэтап A):
 * полезная нагрузка drag & drop, поиск, список недавних.
 */

import { describe, expect, it } from 'vitest';
import type { BlockDefinition } from '@/core/types/blocks';
import { decodeDnd, encodeDnd, matchesQuery, nodeMatchesQuery, pushRecent, quickInsertCandidates } from './library-utils';
import type { PortDefinition } from '@/core/types/ports';

const def: BlockDefinition = {
  id: 'telegram.send_message',
  labelKey: 'blocks.telegram.send_message.label',
  descriptionKey: 'blocks.telegram.send_message.description',
  category: 'telegram_actions',
  keywords: ['телеграм', 'бот', 'отправить', 'сообщение'],
  inputs: [],
  outputs: [],
};

const texts = { label: 'Отправить сообщение', description: 'Отправляет текст в чат' };

describe('encodeDnd / decodeDnd', () => {
  it('округлый прогон: блок без конфигурации', () => {
    expect(decodeDnd(encodeDnd({ blockId: 'core.text' }))).toEqual({ blockId: 'core.text' });
  });

  it('округлый прогон: блок с переопределением конфигурации', () => {
    const payload = { blockId: 'models.call', config: { modelId: 'm1' } };
    expect(decodeDnd(encodeDnd(payload))).toEqual(payload);
  });

  it('старый формат: просто идентификатор блока', () => {
    expect(decodeDnd('flow.delay')).toEqual({ blockId: 'flow.delay' });
  });

  it('мусор и пустота → null', () => {
    expect(decodeDnd('')).toBeNull();
    expect(decodeDnd('not-a-json-or-id')).toBeNull();
    expect(decodeDnd('{"blockId": 123}')).toBeNull();
    expect(decodeDnd('{"nope": true}')).toBeNull();
  });

  it('некорректный тип config отбрасывается', () => {
    expect(decodeDnd('{"blockId": "core.text", "config": [1, 2]}')).toEqual({ blockId: 'core.text' });
  });
});

describe('matchesQuery', () => {
  it('пустой запрос подходит всем', () => {
    expect(matchesQuery(def, '   ', texts)).toBe(true);
  });

  it('ищет по названию без учёта регистра', () => {
    expect(matchesQuery(def, 'ОТПРАВИТЬ', texts)).toBe(true);
    expect(matchesQuery(def, 'получить', texts)).toBe(false);
  });

  it('ищет по описанию', () => {
    expect(matchesQuery(def, 'чат', texts)).toBe(true);
  });

  it('ищет по ключевым словам (синонимы пользователя)', () => {
    expect(matchesQuery(def, 'бот', texts)).toBe(true);
    expect(matchesQuery(def, 'телеграм', texts)).toBe(true);
  });

  it('ищет по техническому идентификатору', () => {
    expect(matchesQuery(def, 'send_message', texts)).toBe(true);
  });
});

describe('pushRecent', () => {
  it('новая деталь — в начало', () => {
    expect(pushRecent(['a'], 'b', 10)).toEqual(['b', 'a']);
  });

  it('дубликаты не накапливаются, деталь поднимается наверх', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b', 10)).toEqual(['b', 'a', 'c']);
  });

  it('список ограничен: остаются самые свежие', () => {
    // Вход: от новых к старым. «a» свежее «c» — при переполнении «c» теряется.
    expect(pushRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
  });
});

describe('nodeMatchesQuery (поиск по схеме)', () => {
  const blockLabel = (id: string) => (id === 'telegram.send_message' ? 'Отправить сообщение' : id);

  it('пустой запрос подходит всем', () => {
    expect(nodeMatchesQuery({ data: { blockId: 'core.text' } }, '  ', blockLabel)).toBe(true);
  });

  it('ищет по имени экземпляра', () => {
    expect(nodeMatchesQuery({ data: { blockId: 'core.text', label: 'Приветствие' } }, 'привет', blockLabel)).toBe(true);
  });

  it('ищет по идентификатору блока', () => {
    expect(nodeMatchesQuery({ data: { blockId: 'telegram.send_message' } }, 'send', blockLabel)).toBe(true);
  });

  it('ищет по локализованному названию блока', () => {
    expect(nodeMatchesQuery({ data: { blockId: 'telegram.send_message' } }, 'отправить', blockLabel)).toBe(true);
    expect(nodeMatchesQuery({ data: { blockId: 'telegram.send_message' } }, 'задержка', blockLabel)).toBe(false);
  });
});

/** Порт-заготовка для тестов быстрой вставки. */
const tport = (id: string, kind: 'data' | 'event' | 'error', type: string): PortDefinition => ({
  id,
  labelKey: id,
  kind,
  type,
});

const tblock = (id: string, inputs: PortDefinition[], outputs: PortDefinition[]): BlockDefinition => ({
  id,
  labelKey: id,
  category: 'core',
  inputs,
  outputs,
});

describe('quickInsertCandidates (быстрая вставка)', () => {
  const blocks = [
    tblock('a.text_sink', [tport('text', 'data', 'text')], []),
    tblock('b.any_sink', [tport('value', 'data', 'any')], []),
    tblock('c.event_sink', [tport('ev', 'event', 'event')], []),
    tblock('d.error_source', [], [tport('error', 'error', 'error')]),
    tblock('e.text_source', [], [tport('text', 'data', 'text')]),
  ];

  it('от текстового OUTPUT предлагает блоки с совместимыми входами', () => {
    const res = quickInsertCandidates(blocks, { direction: 'output', kind: 'data', type: 'text' });
    const ids = res.map((c) => c.def.id);
    expect(ids).toContain('a.text_sink');
    expect(ids).toContain('b.any_sink');
    expect(ids).not.toContain('c.event_sink');
    expect(ids).not.toContain('d.error_source');
  });

  it('от EVENT-входа без событийных выходов кандидатов нет', () => {
    const res = quickInsertCandidates(blocks, { direction: 'input', kind: 'event', type: 'event' });
    expect(res.map((c) => c.def.id)).toEqual([]);
  });

  it('от ERROR-входа предлагает блоки с ошибочными выходами', () => {
    const res = quickInsertCandidates(blocks, { direction: 'input', kind: 'error', type: 'error' });
    const ids = res.map((c) => c.def.id);
    expect(ids).toContain('d.error_source');
    expect(ids).not.toContain('e.text_source');
  });

  it('кандидат получает конкретный совместимый порт', () => {
    const res = quickInsertCandidates(blocks, { direction: 'output', kind: 'data', type: 'text' });
    const sink = res.find((c) => c.def.id === 'a.text_sink');
    expect(sink?.port.id).toBe('text');
  });
});
