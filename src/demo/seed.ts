/**
 * NODEZZLE — демонстрационный проект «Пример: Telegram-приветствие».
 *
 * Схема:
 *   Получено сообщение → В объект (text) → Вызов модели «Приветствие»
 *   → Из объекта (reply) → Отправить сообщение
 *
 * Модель «Приветствие» (контракт: input text → output reply):
 *   Вход (text) → Условие (содержит «привет»?) → Выход (reply)
 *
 * Демонстрирует все ключевые механики: триггер, данные, модель
 * внутри схемы, контракт модели, отправка в Telegram (симуляция).
 */

import type { NodezzleProject, StoredModel } from '@/core/project/schema';

export const DEMO_PROJECT_ID = 'demo_telegram_bot';
export const DEMO_MODEL_ID = 'model_greeting';

export function createDemoProject(): NodezzleProject {
  const now = Date.now();

  const greetingModel: StoredModel = {
    id: DEMO_MODEL_ID,
    name: 'Приветствие',
    version: 1,
    contract: {
      inputs: [{ id: 'text', name: 'Текст сообщения', type: 'text', required: true }],
      outputs: [{ id: 'reply', name: 'Ответ', type: 'text' }],
    },
    canvas: {
      id: 'canvas_model_greeting',
      name: 'Приветствие',
      nodes: [
        {
          id: 'gm_in',
          blockId: 'core.input',
          position: { x: 40, y: 140 },
          config: { portId: 'text' },
        },
        {
          id: 'gm_cond',
          blockId: 'logic.condition',
          position: { x: 320, y: 140 },
          config: {
            operator: 'contains',
            target: 'привет',
            trueValue: 'Привет! Это NODEZZLE 🤖',
            falseValue: 'Напишите «привет», чтобы начать 👋',
          },
        },
        {
          id: 'gm_out',
          blockId: 'core.output',
          position: { x: 640, y: 140 },
          config: { portId: 'reply' },
        },
      ],
      edges: [
        { id: 'gm_e1', source: 'gm_in', sourcePort: 'value', target: 'gm_cond', targetPort: 'value' },
        { id: 'gm_e2', source: 'gm_cond', sourcePort: 'true', target: 'gm_out', targetPort: 'value' },
        { id: 'gm_e3', source: 'gm_cond', sourcePort: 'false', target: 'gm_out', targetPort: 'value' },
      ],
    },
    updatedAt: now,
  };

  return {
    formatVersion: 1,
    id: DEMO_PROJECT_ID,
    name: 'Пример: Telegram-приветствие',
    kind: 'telegram',
    canvas: {
      id: 'canvas_main',
      name: 'Схема',
      nodes: [
        { id: 'dm_msg', blockId: 'telegram.message_received', position: { x: 40, y: 180 }, config: {} },
        { id: 'dm_obj', blockId: 'data.to_object', position: { x: 330, y: 180 }, config: { key: 'text' } },
        {
          id: 'dm_call',
          blockId: 'models.call',
          position: { x: 620, y: 180 },
          config: { modelId: DEMO_MODEL_ID },
        },
        { id: 'dm_from', blockId: 'data.from_object', position: { x: 910, y: 180 }, config: { key: 'reply' } },
        { id: 'dm_send', blockId: 'telegram.send_message', position: { x: 1200, y: 180 }, config: {} },
      ],
      edges: [
        { id: 'dm_e1', source: 'dm_msg', sourcePort: 'text', target: 'dm_obj', targetPort: 'value' },
        { id: 'dm_e2', source: 'dm_obj', sourcePort: 'payload', target: 'dm_call', targetPort: 'payload' },
        { id: 'dm_e3', source: 'dm_call', sourcePort: 'result', target: 'dm_from', targetPort: 'payload' },
        { id: 'dm_e4', source: 'dm_from', sourcePort: 'value', target: 'dm_send', targetPort: 'text' },
        { id: 'dm_e5', source: 'dm_msg', sourcePort: 'chat_id', target: 'dm_send', targetPort: 'chat_id' },
      ],
    },
    models: [greetingModel],
    variables: [],
    meta: { createdAt: now, updatedAt: now },
  };
}
