/** Подтверждение в outbox, не сообщение чата и не реальное окно Telegram. */
import { useTranslation } from 'react-i18next';
import type { TelegramOutMessage } from '@/core/types/runtime';

export function TelegramCallbackNotice({ answer }: { answer: Extract<TelegramOutMessage, { kind: 'callback_answer' }> }) {
  const { t } = useTranslation();
  return <div data-testid="telegram-callback-answer" role="status" className="rounded-lg border border-line px-3 py-2 text-xs">
    <div className="text-muted">{t(answer.showAlert ? 'execution.panel.chat.callbackAlert' : 'execution.panel.chat.callbackNotice')}</div>
    <p className="whitespace-pre-wrap break-words">{answer.text || t('execution.panel.chat.callbackEmpty')}</p>
  </div>;
}
