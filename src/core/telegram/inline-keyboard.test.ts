import { blockRegistry } from '@/blocks';
import { expect, it } from 'vitest';
import { buildInlineKeyboard, readInlineKeyboard } from './inline-keyboard';
import { executeCanvas } from '../runtime/execute';
import type { RuntimeContext } from '../types/runtime';
const button = { text: 'Да', callback_data: 'confirm' };
const keyboard = { inline_keyboard: [[button]] };
it('сохраняет ряды/порядок/текст, создаёт независимую копию', () => {
  const value = { inline_keyboard: [[button, { text: '<b>Нет</b>', callback_data: 'cancel' }], [button]] };
  const parsed = readInlineKeyboard(value);
  expect(parsed).toEqual(value);
  expect(parsed).not.toBe(value);
  expect(parsed!.inline_keyboard[0][0]).not.toBe(button);
});
it.each([
  null, [], {}, { inline_keyboard: [] }, { inline_keyboard: [[]] }, { inline_keyboard: ['row'] },
  { inline_keyboard: [[null]] }, { inline_keyboard: [[{ text: '', callback_data: 'a' }]] },
  { inline_keyboard: [[{ text: '  ', callback_data: 'a' }]] }, { inline_keyboard: [[{ text: 'a', callback_data: '' }]] },
  { inline_keyboard: [[{ text: 'a', callback_data: 'я'.repeat(33) }]] },
  { inline_keyboard: [[{ text: '😀'.repeat(65), callback_data: 'a' }]] },
  { inline_keyboard: [[{ ...button, url: 'https://example.com/' }]] },
  { inline_keyboard: [[{ text: 'Сайт', url: 'https://example.com/' }]] },
  { ...keyboard, resize_keyboard: true },
].map((value) => ({ value })))('отклоняет неверную разметку %j', ({ value }) => {
  expect(readInlineKeyboard(value)).toBeNull();
});
it('локальные лимиты рядов/кнопок и Unicode/UTF-8 проверяются на границе', () => {
  expect(readInlineKeyboard({ inline_keyboard: Array.from({ length: 8 }, () => Array(4).fill(button)) })).not.toBeNull();
  expect(readInlineKeyboard({ inline_keyboard: Array.from({ length: 8 }, () => Array(5).fill(button)) })).toBeNull();
  expect(readInlineKeyboard({ inline_keyboard: Array.from({ length: 9 }, () => [button]) })).toBeNull();
  expect(readInlineKeyboard({ inline_keyboard: [Array(9).fill(button)] })).toBeNull();
  expect(readInlineKeyboard({ inline_keyboard: [[{ text: '😀'.repeat(64), callback_data: 'я'.repeat(32) }]] })).not.toBeNull();
});
it('вход rows приоритетен; строки по проводу/null/битый JSON не означают fallback', () => {
  expect(buildInlineKeyboard({}, { rows: JSON.stringify(keyboard.inline_keyboard) })).toEqual(keyboard);
  expect(buildInlineKeyboard({ rows: [[button]] }, { rows: 'broken' })).toEqual(keyboard);
  expect(buildInlineKeyboard({ rows: null }, { rows: '[[{}]]' })).toBeNull();
  expect(buildInlineKeyboard({ rows: '[[{}]]' }, {})).toBeNull();
  expect(buildInlineKeyboard({}, { rows: 'broken' })).toBeNull();
});
it('runtime: конструктор → необязательный вход send_message → outbox, старые порты сохранены', async () => {
  const doc = { id: 'c', name: 'Кнопки', nodes: [
    { id: 'text', blockId: 'core.text', config: { value: 'Выберите' }, position: { x: 0, y: 0 } },
    { id: 'chat', blockId: 'core.number', config: { value: 42 }, position: { x: 0, y: 0 } },
    { id: 'keyboard', blockId: 'telegram.inline_keyboard', config: { rows: JSON.stringify(keyboard.inline_keyboard) }, position: { x: 0, y: 0 } },
    { id: 'send', blockId: 'telegram.send_message', config: {}, position: { x: 0, y: 0 } },
  ], edges: [
    { id: 'a', source: 'text', sourcePort: 'text', target: 'send', targetPort: 'text' },
    { id: 'b', source: 'chat', sourcePort: 'value', target: 'send', targetPort: 'chat_id' },
    { id: 'c', source: 'keyboard', sourcePort: 'keyboard', target: 'send', targetPort: 'keyboard' },
  ] };
  const result = await executeCanvas(doc);
  expect(result.status).toBe('success');
  expect(result.outbox).toHaveLength(1);
  expect(result.outbox[0]).toMatchObject({ kind: 'text', keyboard, messageId: result.nodeRuns.send.outputs.message_id });
  const legacy = await executeCanvas({ ...doc, edges: doc.edges.slice(0, 2) });
  expect(legacy.outbox[0]).not.toHaveProperty('keyboard');
});
it('невалидная клавиатура/null/чат отменяют отправку до адаптера', async () => {
  let calls = 0;
  const runtime: RuntimeContext = { payload: {}, cancel: { cancelled: false }, log: () => {}, telegram: {
    send: async () => { calls++; return 1; }, sendPhoto: async () => 1,
  } };
  const send = blockRegistry.get('telegram.send_message')!.runtime!;
  for (const inputs of [{ keyboard: null, chat_id: 42 }, { keyboard: {}, chat_id: 42 }, { keyboard, chat_id: 0 }, { keyboard, chat_id: 1.5 }]) {
    expect(await send({ inputs: { text: 'Не отправлять', ...inputs }, config: {}, payload: {}, runtime })).toEqual({ error: 'ERR_TELEGRAM_KEYBOARD' });
  }
  expect(calls).toBe(0);
});

it('rows по проводу приоритетен; ошибка источника не превращается в настройку по умолчанию', async () => {
  const nodes = [
    { id: 'rows', blockId: 'core.array', position: { x: 0, y: 0 }, config: { value: JSON.stringify([[button]]) } },
    { id: 'keyboard', blockId: 'telegram.inline_keyboard', position: { x: 0, y: 0 }, config: { rows: '[[{"text":"Нельзя подставить","callback_data":"fallback"}]]' } },
  ];
  const doc = { id: 'c', name: 'Вход рядов', nodes, edges: [{ id: 'e', source: 'rows', sourcePort: 'value', target: 'keyboard', targetPort: 'rows' }] };
  expect((await executeCanvas(doc)).nodeRuns.keyboard.outputs.keyboard).toEqual(keyboard);
  nodes[0].config.value = 'broken';
  const result = await executeCanvas(doc);
  expect(result.status).toBe('error');
  expect(result.nodeRuns.keyboard?.outputs.keyboard).toBeUndefined();
});
