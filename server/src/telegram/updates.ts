/**
 * Обновления Telegram: строгая валидация и нормализация (подэтап 5.8B).
 *
 * Всё, что приходит извне, считается недоверенным: объект проверяется
 * схемой, в событие NODEZZLE попадают ТОЛЬКО явно описанные поля
 * (никакой передачи «как есть»). Токенов и секретов здесь нет и не
 * должно быть — только публичные данные обновления.
 */

import { z } from 'zod';
import { readCallback, validCallbackData, validCallbackId } from '../../../src/core/telegram/callback.ts';
import type { TriggerPayload } from '../../../src/core/types/runtime.ts';

const userSchema = z.object({
  id: z.number().int(),
  username: z.string().max(64).optional(),
  first_name: z.string().max(256).optional(),
});

const chatSchema = z.object({
  id: z.number().int(),
  type: z.string().max(32),
});

const messageSchema = z.object({
  message_id: z.number().int(),
  text: z.string().max(4096).optional(),
  from: userSchema.optional(),
  chat: chatSchema,
});

/** Минимально необходимое подмножество Telegram Update. */
export const telegramUpdateSchema = z.object({
  update_id: z.number().int(),
  message: messageSchema.optional(),
  edited_message: messageSchema.optional(),
  callback_query: z.object({
    id: z.string().refine(validCallbackId),
    from: userSchema,
    data: z.string().refine(validCallbackData).optional(),
    message: messageSchema.extend({ date: z.number().int().nonnegative().optional() }).optional(),
    inline_message_id: z.string().max(256).optional(),
    game_short_name: z.string().max(64).optional(),
  }).optional(),
}).refine((u) => [u.message, u.edited_message, u.callback_query].filter(Boolean).length <= 1);

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;

/** Нормализованное входящее событие. */
export interface TelegramEvent {
  updateId: number;
  payload: TriggerPayload;
}

/** Команда вида `/start` или `/help@MyBot аргументы`. */
const COMMAND_RE = /^\/([a-zA-Z0-9_]{1,32})(?:@\S+)?(?:\s|$)/;

export function updateToEvent(update: TelegramUpdate): TelegramEvent | null {
  if (update.callback_query) {
    const q = update.callback_query;
    // Inline-mode, игры и недоступные сообщения требуют отдельного контракта.
    if (!q.message || q.message.date === 0 || q.inline_message_id || q.game_short_name) return null;
    const payload: TriggerPayload = { source: 'telegram', telegram: {
      event: 'callback_query', callback_id: q.id, data: q.data,
      text: '', message_id: q.message.message_id, chat_id: q.message.chat.id,
      user_id: q.from.id, ...(q.from.username !== undefined ? { username: q.from.username } : {}),
    } };
    return readCallback(payload) ? { updateId: update.update_id, payload } : null;
  }
  const message = update.message ?? update.edited_message;
  if (!message) return null; // остальные типы обновлений пока игнорируем
  const text = message.text ?? '';
  const match = COMMAND_RE.exec(text);
  const command = match ? match[1] : undefined;
  const payload: TriggerPayload = {
    source: 'telegram',
    telegram: {
      text,
      ...(command !== undefined ? { command } : {}),
      user_id: message.from?.id ?? 0,
      ...(message.from?.username !== undefined ? { username: message.from.username } : {}),
      chat_id: message.chat.id,
    },
  };
  return { updateId: update.update_id, payload };
}
