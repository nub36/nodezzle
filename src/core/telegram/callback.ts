/** Общая граница callback для runtime, симулятора и нормализованного вебхука. */
import type { TriggerPayload } from '../types/runtime';

export function validCallbackId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\s\u0000-\u001f\u007f]/u.test(value);
}
export function validCallbackData(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && new TextEncoder().encode(value).length <= 64;
}
export function readCallback(payload: TriggerPayload) {
  const m = payload.telegram;
  if ((payload.source !== undefined && payload.source !== 'telegram') || m?.event !== 'callback_query'
    || !validCallbackId(m.callback_id) || !validCallbackData(m.data)
    || !Number.isSafeInteger(m.user_id) || m.user_id <= 0
    || !Number.isSafeInteger(m.chat_id) || m.chat_id === 0
    || typeof m.message_id !== 'number' || !Number.isSafeInteger(m.message_id) || m.message_id <= 0) return null;
  return { callback_id: m.callback_id, data: m.data, message_id: m.message_id, user_id: m.user_id, chat_id: m.chat_id };
}
