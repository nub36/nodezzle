/** Один контрол кнопок для Чата/Телефона; событие собирается только из текущего outbox. */
import { useTranslation } from 'react-i18next';
import type { TelegramOutMessage } from '@/core/types/runtime';
import { readInlineKeyboard } from '@/core/telegram/inline-keyboard';
import { canUseTelegramKeyboard, useExecutionStore } from '@/store/execution-store';
import { useProjectStore } from '@/store/project-store';

export function TelegramKeyboardView({ message }: { message: Extract<TelegramOutMessage, { kind: 'text' }> }) {
  const { t } = useTranslation();
  // Обновление доступности при изменении любого контекста схемы или результата.
  useProjectStore();
  const execution = useExecutionStore();
  const keyboard = readInlineKeyboard(message.keyboard);
  if (!keyboard) return <p role="alert" className="text-xs text-red-300">{t('errors.ERR_TELEGRAM_KEYBOARD')}</p>;
  const enabled = canUseTelegramKeyboard(message.id);
  return <div data-testid="telegram-keyboard" data-outbox-id={message.id} role="group" aria-label={t('execution.panel.chat.keyboard')} className="mt-2 min-w-0 space-y-1">
    {keyboard.inline_keyboard.map((row, rowIndex) => <div key={rowIndex} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
      {row.map((button, column) => <button key={column} type="button" disabled={!enabled}
        className="min-w-0 rounded border border-cyan-300/30 px-2 py-1.5 text-xs whitespace-pre-wrap break-words text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => { void execution.fireTelegramButton(message.id, rowIndex, column); }}>{button.text}</button>)}
    </div>)}
    <p className="text-[10px] leading-snug text-muted">{t(enabled ? 'execution.panel.chat.keyboardHint' : 'execution.panel.chat.keyboardUnavailable')}</p>
  </div>;
}
