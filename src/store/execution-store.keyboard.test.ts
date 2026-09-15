import '@/blocks';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createDemoProject } from '@/demo/seed';
import { canvasToFlow } from '@/core/project/serialize';
import { canUseTelegramKeyboard, useExecutionStore } from './execution-store';
import { useProjectStore } from './project-store';
const node = (id: string, blockId: string, config: Record<string, unknown> = {}) => ({ id, blockId, config, position: { x: 0, y: 0 } });
const edge = (id: string, source: string, sourcePort: string, target: string, targetPort: string) => ({ id, source, sourcePort, target, targetPort });
const canvas = { id: 'c', name: 'Клавиатуры', nodes: [
  node('trigger', 'telegram.message_received'),
  ...[1, 2].flatMap((i) => [node(`k${i}`, 'telegram.inline_keyboard', { rows: JSON.stringify([[{ text: 'Одинаково', callback_data: `action-${i}` }]]) }), node(`chat${i}`, 'core.number', { value: i * 11 }), node(`send${i}`, 'telegram.send_message')]),
  node('q', 'telegram.callback_query'), node('answer', 'telegram.answer_callback'),
], edges: [
  ...[1, 2].flatMap((i) => [edge(`t${i}`, 'trigger', 'text', `send${i}`, 'text'), edge(`chat${i}`, `chat${i}`, 'value', `send${i}`, 'chat_id'), edge(`k${i}`, `k${i}`, 'keyboard', `send${i}`, 'keyboard')]),
  edge('id', 'q', 'callback_id', 'answer', 'callback_id'), edge('data', 'q', 'data', 'answer', 'text'),
] };
beforeEach(() => {
  useExecutionStore.getState().reset();
  useExecutionStore.setState({ history: [], payload: { source: 'telegram', telegramEvent: 'message', text: 'Выберите', command: '', chatId: 999, userId: 123, webJson: '{}' } });
  const project = { ...createDemoProject(), canvas, models: [] };
  useProjectStore.setState({ project, ...canvasToFlow(canvas), activeModelId: null, groups: [] });
});
afterEach(() => {
  useExecutionStore.getState().reset();
  useExecutionStore.setState({ history: [] });
  useProjectStore.setState({ project: null, nodes: [], edges: [], activeModelId: null });
});
it('клик адресует запись outbox, а не одинаковую подпись/текущий chatId; результат заменяется', async () => {
  await useExecutionStore.getState().run();
  const messages = useExecutionStore.getState().outbox;
  expect(messages).toHaveLength(2);
  expect(new Set(messages.map((m) => m.id)).size).toBe(2);
  const second = messages.find((m) => m.kind === 'text' && m.chatId === 22)!;
  expect(canUseTelegramKeyboard(second.id)).toBe(true);
  expect(await useExecutionStore.getState().fireTelegramButton(second.id, 0, 0)).toBe(true);
  const state = useExecutionStore.getState();
  expect(state.nodeInfo.q.outputs).toMatchObject({ data: 'action-2', chat_id: 22, user_id: 123, message_id: second.kind === 'text' ? second.messageId : 0 });
  expect(state.nodeInfo.q.outputs.callback_id).toMatch(/^sim-/);
  expect(state.nodeInfo.trigger.status).toBe('skipped');
  expect(state.outbox).toEqual([expect.objectContaining({ kind: 'callback_answer', text: 'action-2' })]);
  expect(state.chatEcho).toBeNull();
  expect(state.history[0].telegramEvent).toBe('callback_query');
  expect(await state.fireTelegramButton(messages[0].id, 0, 0)).toBe(false);
  expect(useExecutionStore.getState().history).toHaveLength(2);
});
it('перенос сохраняет доступность; правка конфигурации/модели/проекта блокирует прямой вызов', async () => {
  await useExecutionStore.getState().run();
  const id = useExecutionStore.getState().outbox[0].id;
  const original = useProjectStore.getState();
  useProjectStore.setState({ nodes: original.nodes.map((n) => ({ ...n, position: { x: 500, y: 0 } })) });
  expect(canUseTelegramKeyboard(id)).toBe(true);
  for (const patch of [
    { nodes: original.nodes.map((n) => ({ ...n, data: { ...n.data, config: { ...n.data.config, changed: 1 } } })) },
    { nodes: original.nodes, activeModelId: 'another' },
    { activeModelId: null, project: { ...original.project!, id: 'another' } },
  ]) {
    useProjectStore.setState(patch);
    expect(await useExecutionStore.getState().fireTelegramButton(id, 0, 0)).toBe(false);
  }
  expect(useExecutionStore.getState().history).toHaveLength(1);
});
it('невалидные индексы/пользователь, running и неуспешный запуск не отправляют событие', async () => {
  await useExecutionStore.getState().run();
  const id = useExecutionStore.getState().outbox[0].id;
  for (const [row, col] of [[-1, 0], [0, -1], [1, 0], [0, 1], [NaN, 0], [0, 0.5]]) expect(await useExecutionStore.getState().fireTelegramButton(id, row, col)).toBe(false);
  useExecutionStore.getState().setPayload({ userId: 0 });
  expect(await useExecutionStore.getState().fireTelegramButton(id, 0, 0)).toBe(false);
  useExecutionStore.getState().setPayload({ userId: 123 });
  useExecutionStore.setState({ running: true });
  expect(await useExecutionStore.getState().fireTelegramButton(id, 0, 0)).toBe(false);
  useExecutionStore.setState({ running: false, status: 'error' });
  expect(await useExecutionStore.getState().fireTelegramButton(id, 0, 0)).toBe(false);
  expect(useExecutionStore.getState().history).toHaveLength(1);
});
it('быстрый двойной вызов не повторяет событие старой кнопки', async () => {
  await useExecutionStore.getState().run();
  const state = useExecutionStore.getState();
  const id = state.outbox[0].id;
  expect(await Promise.all([state.fireTelegramButton(id, 0, 0), state.fireTelegramButton(id, 0, 0)])).toEqual([true, false]);
  expect(useExecutionStore.getState().history).toHaveLength(2);
});
