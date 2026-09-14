/**
 * Категория «Telegram» (telegram).
 *
 * Telegram Layer построен поверх общего ядра: блоки — обычные
 * Block Definitions, транспорт (Bot API) изолирован в RuntimeContext.telegram.
 * Сейчас отправки идут в outbox (симуляция); реальный Bot API подключается
 * через backend (см. docs/TELEGRAM.md). Токен бота — только в .env сервера.
 */

import type { BlockDefinition } from '@/core/types/blocks';
import type { TriggerPayload } from '@/core/types/runtime';
import { dport, eport, ERR } from '../shared';

function normalizeCommand(raw: string): string {
  return raw.trim().replace(/^\//, '').toLowerCase();
}

export const telegramBlocks: BlockDefinition[] = [
  {
    id: 'telegram.message_received',
    labelKey: 'blocks.telegram.message_received.label',
    descriptionKey: 'blocks.telegram.message_received.description',
    keywords: ['телеграм', 'бот', 'сообщение', 'входящее', 'триггер', 'событие'],
    category: 'telegram',
    trigger: true,
    inputs: [],
    outputs: [
      dport('text', 'blocks.ports.text', 'text'),
      dport('user_id', 'blocks.ports.user_id', 'number'),
      dport('chat_id', 'blocks.ports.chat_id', 'number'),
      dport('username', 'blocks.ports.username', 'text'),
      dport('message', 'blocks.ports.message', 'telegram_message'),
    ],
    matches: (payload: TriggerPayload) => payload.source === undefined || payload.source === 'telegram',
    runtime: ({ payload, runtime }) => {
      const m = payload.telegram ?? { text: '', user_id: 0, chat_id: 0 };
      runtime.log('info', 'telegram.message_received', {
        text: m.text,
        user_id: m.user_id,
        chat_id: m.chat_id,
      });
      return {
        outputs: {
          text: m.text ?? '',
          user_id: m.user_id ?? 0,
          chat_id: m.chat_id ?? 0,
          username: m.username ?? '',
          message: m,
        },
      };
    },
    ui: { icon: '📨', color: '#60a5fa' },
  },
  {
    id: 'telegram.command',
    labelKey: 'blocks.telegram.command.label',
    descriptionKey: 'blocks.telegram.command.description',
    keywords: ['телеграм', 'бот', 'команда', 'слеш', 'триггер', 'старт'],
    category: 'telegram',
    trigger: true,
    inputs: [],
    outputs: [
      dport('command', 'blocks.ports.command', 'text'),
      dport('args', 'blocks.ports.args', 'text'),
      dport('user_id', 'blocks.ports.user_id', 'number'),
      dport('chat_id', 'blocks.ports.chat_id', 'number'),
    ],
    defaults: { command: '/start' },
    matches: (payload: TriggerPayload, config: Record<string, unknown>) => {
      const m = payload.telegram;
      if (!m || payload.source === 'web') return false;
      const expected = normalizeCommand(String(config.command ?? ''));
      return expected !== '' && normalizeCommand(m.command ?? '') === expected;
    },
    runtime: ({ payload, config }) => {
      const m = payload.telegram ?? { text: '', user_id: 0, chat_id: 0 };
      const command = String(config.command ?? '').trim();
      const args = (m.text ?? '').replace(/^\//, '').replace(/^\S+\s*/, '').trim();
      return {
        outputs: {
          command,
          args,
          user_id: m.user_id ?? 0,
          chat_id: m.chat_id ?? 0,
        },
      };
    },
    ui: { icon: '⚡', color: '#60a5fa' },
  },
  {
    id: 'telegram.send_message',
    labelKey: 'blocks.telegram.send_message.label',
    descriptionKey: 'blocks.telegram.send_message.description',
    keywords: ['телеграм', 'бот', 'отправить', 'сообщение', 'ответ', 'чат'],
    category: 'telegram',
    inputs: [dport('text', 'blocks.ports.text', 'text'), dport('chat_id', 'blocks.ports.chat_id', 'number')],
    outputs: [dport('message_id', 'blocks.ports.message_id', 'number'), eport()],
    runtime: async ({ inputs, runtime }) => {
      const text = String(inputs.text ?? '');
      const chatId = Number(inputs.chat_id);
      if (text.trim() === '') return { error: ERR.EMPTY_INPUT };
      if (!Number.isFinite(chatId)) return { error: ERR.EMPTY_INPUT };
      runtime.log('info', 'telegram.send_message', { chatId, text });
      const messageId = await runtime.telegram.send({ chatId, text });
      return { outputs: { message_id: messageId } };
    },
    ui: { icon: '💬', color: '#60a5fa' },
  },
  {
    id: 'telegram.send_photo',
    labelKey: 'blocks.telegram.send_photo.label',
    descriptionKey: 'blocks.telegram.send_photo.description',
    keywords: ['телеграм', 'бот', 'фото', 'картинка', 'изображение', 'отправить'],
    category: 'telegram',
    inputs: [
      dport('photo', 'blocks.ports.photo', 'image'),
      dport('caption', 'blocks.ports.caption', 'text'),
      dport('chat_id', 'blocks.ports.chat_id', 'number'),
    ],
    outputs: [dport('message_id', 'blocks.ports.message_id', 'number'), eport()],
    runtime: async ({ inputs, runtime }) => {
      const chatId = Number(inputs.chat_id);
      if (!Number.isFinite(chatId)) return { error: ERR.EMPTY_INPUT };
      const caption = inputs.caption === undefined || inputs.caption === null ? '' : String(inputs.caption);
      runtime.log('info', 'telegram.send_photo', { chatId, caption, photo: inputs.photo });
      const messageId = await runtime.telegram.sendPhoto({ chatId, photo: inputs.photo ?? null, caption });
      return { outputs: { message_id: messageId } };
    },
    ui: { icon: '🖼️', color: '#60a5fa' },
  },
];
