import { blockRegistry } from '@/blocks';
import { expect, it } from 'vitest';
import type { TriggerPayload } from '../types/runtime';
import { readCallback, validCallbackData, validCallbackId } from './callback';
import { executeCanvas } from '../runtime/execute';
import { buildTriggerPayload, type SimulatorPayload } from '@/store/execution-store';

const callback: TriggerPayload = { source: 'telegram', telegram: { event: 'callback_query', callback_id: 'cb-1', data: 'confirm', message_id: 10, user_id: 7, chat_id: -42, text: '/start', command: 'start' } };
const node = (id: string, blockId: string, config: Record<string, unknown> = {}) => ({ id, blockId, config, position: { x: 0, y: 0 } });
const doc = {
  id: 'c', name: 'Колбэк', nodes: [
    node('callback', 'telegram.callback_query', { callbackDataFilter: 'confirm' }),
    node('other', 'telegram.callback_query', { callbackDataFilter: 'cancel' }),
    node('message', 'telegram.message_received'), node('command', 'telegram.command', { command: '/start' }),
    node('answer', 'telegram.answer_callback', { text: 'Принято', show_alert: true }),
  ], edges: [{ id: 'e', source: 'callback', sourcePort: 'callback_id', target: 'answer', targetPort: 'callback_id' }],
};
it('данные ограничены байтами UTF-8, ID — непробельной строкой', () => {
  expect(validCallbackData('я'.repeat(32))).toBe(true);
  expect(validCallbackData('я'.repeat(33))).toBe(false);
  expect(validCallbackData('😀'.repeat(16))).toBe(true);
  expect(validCallbackData('😀'.repeat(17))).toBe(false);
  expect(validCallbackData('')).toBe(false);
  expect(validCallbackId('cb-1')).toBe(true);
  expect(validCallbackId('cb\n1')).toBe(false);
  expect(validCallbackId('x'.repeat(257))).toBe(false);
});
it.each([
  { callback_id: '' }, { callback_id: 1 }, { data: null }, { data: '' },
  { data: 'x'.repeat(65) }, { user_id: 0 }, { chat_id: 0 }, { message_id: -1 },
  { chat_id: 1.5 }, { message_id: undefined }, { event: 'unknown' },
])('не принимает некорректный callback %j', (patch) => {
  expect(readCallback({ ...callback, telegram: { ...callback.telegram, ...patch } } as TriggerPayload)).toBeNull();
});
it('runtime: фильтр/разделение событий/ответ с явным ID, уведомление не сообщение', async () => {
  const result = await executeCanvas(doc, { payload: callback });
  expect(result.status).toBe('success');
  expect(result.nodeRuns.callback.outputs).toEqual({ callback_id: 'cb-1', data: 'confirm', message_id: 10, user_id: 7, chat_id: -42 });
  for (const id of ['other', 'message', 'command']) expect(result.nodeRuns[id].status).toBe('skipped');
  expect(result.nodeRuns.answer.outputs).toEqual({ ok: true });
  expect(result.outbox).toEqual([expect.objectContaining({ kind: 'callback_answer', callbackQueryId: 'cb-1', text: 'Принято', showAlert: true })]);
  expect(result.outbox[0]).not.toHaveProperty('chatId');
});
it('обычный/устаревший payload сообщения сохраняется; Web/model не запускают callback', async () => {
  const message: TriggerPayload = { source: 'telegram', telegram: { text: '/start', command: 'start', user_id: 7, chat_id: 42 } };
  const result = await executeCanvas(doc, { payload: message });
  expect(result.nodeRuns.message.status).toBe('success');
  expect(result.nodeRuns.command.status).toBe('success');
  expect(result.nodeRuns.callback.status).toBe('skipped');
  expect(result.outbox).toEqual([]);
  for (const source of ['web', 'model'] as const) expect(readCallback({ ...callback, source })).toBeNull();
});
it('точный фильтр не обрезает данные; пустой принимает все, некорректный — ничего', async () => {
  for (const [filter, status] of [['confirm', 'success'], ['', 'success'], [' confirm ', 'skipped'], [null, 'skipped'], [12, 'skipped']] as const) {
    const result = await executeCanvas({ ...doc, nodes: [node('callback', 'telegram.callback_query', { callbackDataFilter: filter })], edges: [] }, { payload: callback });
    expect(result.nodeRuns.callback.status).toBe(status);
  }
});
it('без явного ID ответ использует только проверенное текущее callback-событие', async () => {
  const answer = { ...doc, nodes: [node('answer', 'telegram.answer_callback')], edges: [] };
  expect((await executeCanvas(answer, { payload: callback })).outbox[0]).toMatchObject({ kind: 'callback_answer', text: '', showAlert: false, callbackQueryId: 'cb-1' });
  expect((await executeCanvas(answer)).nodeRuns.answer.error).toBe('ERR_TELEGRAM_CALLBACK');
});
it.each([{ text: 'a'.repeat(201) }, { text: null }, { show_alert: 'false' }, { show_alert: null }])('не отправляет некорректные настройки ответа %j', async (config) => {
  const result = await executeCanvas({ ...doc, nodes: [node('answer', 'telegram.answer_callback', config)], edges: [] }, { payload: callback });
  expect(result.nodeRuns.answer.error).toBe('ERR_TELEGRAM_CALLBACK');
  expect(result.outbox).toEqual([]);
});
it('явный ID позволяет отвечать вне текущего callback-события', async () => {
  const result = await executeCanvas({ ...doc, nodes: [node('id', 'core.text', { value: 'explicit-2' }), node('answer', 'telegram.answer_callback')], edges: [{ id: 'e', source: 'id', sourcePort: 'text', target: 'answer', targetPort: 'callback_id' }] });
  expect(result.outbox[0]).toMatchObject({ callbackQueryId: 'explicit-2' });
});
it('симулятор не переносит старый текст/команду в callback и обратно', () => {
  const sim: SimulatorPayload = { source: 'telegram', text: '/start', command: 'start', userId: 7, chatId: -42, webJson: '{}', telegramEvent: 'callback_query', callbackId: 'cb-1', callbackData: 'confirm', messageId: 10 };
  const payload = buildTriggerPayload(sim, ['telegram_events']);
  expect(readCallback(payload)).not.toBeNull();
  expect(payload.telegram?.text).toBe('');
  expect(payload.telegram?.command).toBeUndefined();
  expect(buildTriggerPayload({ ...sim, telegramEvent: 'message' }, ['telegram_events']).telegram).toEqual({ text: '/start', command: 'start', user_id: 7, chat_id: -42 });
  expect(buildTriggerPayload(sim, ['web_events']).source).toBe('web');
});

it('null входы не используют fallback; старый адаптер явно сообщает отсутствие поддержки', async () => {
  const handler = blockRegistry.get('telegram.answer_callback')!.runtime!;
  const runtime = { payload: callback, cancel: { cancelled: false }, log: () => {}, telegram: { send: async () => 1, sendPhoto: async () => 1 } };
  for (const inputs of [{ callback_id: null }, { text: null }, { show_alert: null }]) {
    expect(await handler({ inputs, config: {}, payload: callback, runtime })).toEqual({ error: 'ERR_TELEGRAM_CALLBACK' });
  }
  expect(await handler({ inputs: {}, config: {}, payload: callback, runtime })).toEqual({ error: 'ERR_TELEGRAM_CALLBACK_ADAPTER' });
});
