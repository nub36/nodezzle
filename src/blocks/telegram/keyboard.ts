/** Конструктор разметки, сам ничего не отправляет (09C2). */
import type { BlockDefinition } from '@/core/types/blocks';
import { buildInlineKeyboard } from '@/core/telegram/inline-keyboard';
import { dport, eport } from '../shared';
export const telegramKeyboardBlocks: BlockDefinition[] = [{
  id: 'telegram.inline_keyboard', version: '1',
  labelKey: 'blocks.telegram.inline_keyboard.label', descriptionKey: 'blocks.telegram.inline_keyboard.description',
  keywords: ['телеграм', 'кнопки', 'клавиатура', 'инлайн', 'callback'],
  category: 'telegram_actions', subcategory: 'inline', difficulty: 'advanced', status: 'implemented', available: true,
  inputs: [dport('rows', 'blocks.ports.keyboard_rows', 'array')],
  outputs: [dport('keyboard', 'blocks.ports.keyboard', 'object'), eport()],
  defaults: { rows: '[[{"text":"Подтвердить","callback_data":"confirm"}]]' },
  runtime: ({ inputs, connectedInputs, config }) => {
    if (connectedInputs?.includes('rows') && inputs.rows === undefined) return { error: 'ERR_TELEGRAM_KEYBOARD' };
    const keyboard = buildInlineKeyboard(inputs, config);
    return keyboard ? { outputs: { keyboard } } : { error: 'ERR_TELEGRAM_KEYBOARD' };
  },
  ui: { icon: '🔘', color: '#3b82f6' },
}];
