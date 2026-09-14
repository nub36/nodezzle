import '@/blocks';
import { expect, it } from 'vitest';
import { buildTextElement, readTextElement } from './text-element';
import { executeCanvas } from '@/core/runtime/execute';

it('настройки используются без входов, входные пустые строки не заменяются настройкой', () => {
  expect(buildTextElement('heading', { text: undefined, level: undefined }, { text: 'Настройка', level: 3 })).toEqual({ kind: 'heading', text: 'Настройка', level: 3 });
  expect(buildTextElement('text', {}, { text: 'Настройка' })).toEqual({ kind: 'text', text: 'Настройка' });
  expect(buildTextElement('text', { text: '' }, { text: 'Настройка' })).toEqual({ kind: 'text', text: '' });
  expect(buildTextElement('heading', { text: 'Вход', level: 6 }, { text: 'Настройка', level: 1 })).toEqual({ kind: 'heading', text: 'Вход', level: 6 });
});
it.each([0, 7, -1, 2.5, '2', null, Infinity])('отклоняет недопустимый уровень %s', (level) => {
  expect(buildTextElement('heading', { text: 'Текст', level }, {})).toBeNull();
  expect(buildTextElement('heading', {}, { text: 'Текст', level })).toBeNull();
});
it('не превращает объекты/числа/null на входе text в произвольный текст', () => {
  for (const text of [{ html: '<script>' }, 42, null]) expect(buildTextElement('text', { text }, {})).toBeNull();
});
it('дескриптор не переносит атрибуты, html и неизвестные виды', () => {
  expect(readTextElement({ kind: 'text', text: '<img src=x onerror=alert(1)>', onClick: 'code', html: '<script>' })).toEqual({ kind: 'text', text: '<img src=x onerror=alert(1)>' });
  for (const v of [null, {}, { kind: 'html', text: 'x' }, { kind: 'heading', text: 'x' }, { kind: 'text' }]) expect(readTextElement(v)).toBeNull();
});
it('реальный runtime доставляет текст по проводу и выдаёт элемент через прежний порт', async () => {
  const result = await executeCanvas({ id: 'c', name: 'Холст', nodes: [
    { id: 'source', blockId: 'core.text', config: { value: 'Из схемы' }, position: { x: 0, y: 0 } },
    { id: 'heading', blockId: 'web.heading', config: { text: 'Настройка', level: 3 }, position: { x: 0, y: 0 } },
  ], edges: [{ id: 'e', source: 'source', sourcePort: 'text', target: 'heading', targetPort: 'text' }] });
  expect(result.status).toBe('success');
  expect(result.nodeRuns.heading.outputs.element).toEqual({ kind: 'heading', text: 'Из схемы', level: 3 });
});
it('ошибка настроек — error, не успешный элемент', async () => {
  const result = await executeCanvas({ id: 'c', name: 'Холст', nodes: [{ id: 'h', blockId: 'web.heading', config: { text: 'x', level: 9 }, position: { x: 0, y: 0 } }], edges: [] });
  expect(result.nodeRuns.h.error).toBe('ERR_WEB_ELEMENT');
  expect(result.nodeRuns.h.outputs.element).toBeUndefined();
});
