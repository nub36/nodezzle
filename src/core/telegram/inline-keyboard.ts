/** Белый список callback-клавиатуры. Это данные Bot API, не DOM-атрибуты. */
import { validCallbackData } from './callback';
export interface InlineKeyboard { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> }
export const INLINE_KEYBOARD_LIMITS = { rows: 8, columns: 8, buttons: 32, label: 64 } as const;

export function readInlineKeyboard(value: unknown): InlineKeyboard | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).length !== 1 || !Object.hasOwn(obj, 'inline_keyboard') || !Array.isArray(obj.inline_keyboard)) return null;
  const rows = obj.inline_keyboard;
  if (!rows.length || rows.length > INLINE_KEYBOARD_LIMITS.rows) return null;
  const parsed: InlineKeyboard['inline_keyboard'] = [];
  let count = 0;
  for (const row of rows) {
    if (!Array.isArray(row) || !row.length || row.length > INLINE_KEYBOARD_LIMITS.columns) return null;
    const buttons: InlineKeyboard['inline_keyboard'][number] = [];
    for (const raw of row) {
      if (++count > INLINE_KEYBOARD_LIMITS.buttons || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const button = raw as Record<string, unknown>;
      if (Object.keys(button).length !== 2 || !Object.hasOwn(button, 'text') || !Object.hasOwn(button, 'callback_data') || typeof button.text !== 'string' || !button.text.trim()
        || [...button.text].length > INLINE_KEYBOARD_LIMITS.label || !validCallbackData(button.callback_data)) return null;
      buttons.push({ text: button.text, callback_data: button.callback_data });
    }
    parsed.push(buttons);
  }
  return { inline_keyboard: parsed };
}

export function buildInlineKeyboard(inputs: Record<string, unknown>, config: Record<string, unknown>): InlineKeyboard | null {
  let rows = inputs.rows;
  if (rows === undefined) {
    if (typeof config.rows !== 'string') return null;
    try { rows = JSON.parse(config.rows); } catch { return null; }
  }
  return readInlineKeyboard({ inline_keyboard: rows });
}
