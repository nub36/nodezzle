import { describe, expect, it } from 'vitest';
import '@/blocks';
import { blockRegistry } from '@/core/registry/block-registry';
import { executeCanvas } from '@/core/runtime/execute';
import type { CanvasDocument } from '@/core/project/schema';
import type { NodeExecutionContext } from '@/core/types/runtime';
function doc(replyText?: string, wired = false): CanvasDocument {
  return { id: 'canvas', name: 'Один бот', nodes: [
    { id: 'a', blockId: 'telegram.message_received', position: { x: 0, y: 0 }, config: {} },
    { id: 'b', blockId: 'telegram.send_message', position: { x: 320, y: 0 }, config: replyText === undefined ? {} : { replyText } },
  ], edges: [
    { id: 'chat', source: 'a', sourcePort: 'chat_id', target: 'b', targetPort: 'chat_id' },
    ...(wired ? [{ id: 'text', source: 'a', sourcePort: 'text', target: 'b', targetPort: 'text' }] : []),
  ] };
}
const execute = (d: CanvasDocument, text = 'Сообщение пользователя') => executeCanvas(d, { registry: blockRegistry, payload: { source: 'telegram', telegram: { text, chat_id: 123, user_id: 42 } } });
describe('тот же send_message: config только без провода', () => {
  it('два обычных узла и chat_id: фиксированный ответ через прежний runtime', async () => {
    const result = await execute(doc('Привет!'));
    expect(result.status).toBe('success'); expect(result.outbox).toHaveLength(1);
    expect(result.outbox[0]).toMatchObject({ text: 'Привет!', chatId: 123 });
  });
  it('сохраняет старое эхо и приоритет провода над настройкой', async () => {
    for (const value of [undefined, 'Не использовать']) {
      const result = await execute(doc(value, true));
      expect(result.outbox[0]).toMatchObject({ text: 'Сообщение пользователя' });
    }
  });
  it('пустой подключённый текст не заменяется настройкой', async () => {
    const result = await execute(doc('Нельзя отправить', true), '');
    expect(result.status).toBe('error'); expect(result.outbox).toHaveLength(0);
  });
  it('старый блок без текста остаётся ошибкой; пустая настройка не успех', async () => {
    for (const value of [undefined, '', '   ']) {
      const result = await execute(doc(value));
      expect(result.status).toBe('error'); expect(result.outbox).toHaveLength(0);
    }
  });
  it('не выводит получателя из скрытого payload', async () => {
    const d = doc('Привет!'); d.edges = [];
    const result = await execute(d); expect(result.outbox).toHaveLength(0);
  });
  it('недоставленный подключённый вход не использует fallback', async () => {
    const reply = blockRegistry.get('telegram.send_message')!;
    const result = await reply.runtime!({ inputs: { chat_id: 123 }, connectedInputs: ['text', 'chat_id'], config: { replyText: 'Не отправлять' } } as unknown as NodeExecutionContext);
    expect(result.error).toBe('ERR_EMPTY_INPUT');
  });
});
