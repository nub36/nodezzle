/**
 * Предпросмотр телефона с Telegram (Этап 2, подэтап I, часть 1).
 *
 * Показывает, как бот выглядит и отвечает в телефоне пользователя:
 * рамка телефона, шапка бота, пузыри сообщений. Данные — из симулятора
 * (входящее эхо + outbox отправленных схемой сообщений). Это превью
 * симуляции, а не реальный Telegram-транспорт (он — в следующих этапах
 * дорожной карты).
 */

import { TelegramKeyboardView } from './TelegramKeyboardView';
import { TelegramCallbackNotice } from './TelegramCallbackNotice';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useExecutionStore } from '@/store/execution-store';
import { useProjectStore } from '@/store/project-store';
import { formatTimeRu } from '@/lib/utils';

export function PhonePreview() {
  const { t } = useTranslation();
  const outbox = useExecutionStore((s) => s.outbox);
  const chatEcho = useExecutionStore((s) => s.chatEcho);
  const project = useProjectStore((s) => s.project);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [outbox, chatEcho]);

  return (
    <div className="flex justify-center pt-2">
      <div className="phone-frame">
        {/* Шапка телефона */}
        <div className="flex items-center gap-2 border-b border-line/60 px-3 py-2">
          <span className="text-base" aria-hidden="true">
            🤖
          </span>
          <div className="flex-1 leading-tight">
            <div className="truncate text-[11.5px] font-semibold">{project?.name ?? 'NODEZZLE'}</div>
            <div className="text-[9.5px] text-emerald-300/80">{t('execution.panel.phone.botOnline')}</div>
          </div>
          <span className="text-xs text-muted" aria-hidden="true">
            📶
          </span>
        </div>

        {/* Лента сообщений */}
        <div ref={listRef} className="phone-feed">
          {chatEcho === null && outbox.length === 0 && (
            <div className="px-4 py-8 text-center text-[10.5px] leading-relaxed text-muted/70">
              {t('execution.panel.phone.empty')}
            </div>
          )}

          {chatEcho !== null && (
            <div className="flex justify-end">
              <div className="phone-bubble phone-bubble--user">
                <div className="whitespace-pre-wrap break-words">{chatEcho}</div>
              </div>
            </div>
          )}

          {outbox.map((msg) => msg.kind === 'callback_answer' ? <TelegramCallbackNotice key={msg.id} answer={msg} /> : (
            <div key={msg.id} className="flex justify-start">
              <div className="phone-bubble phone-bubble--bot">
                {msg.kind === 'photo' && (
                  <div className="mb-1 flex h-20 w-36 items-center justify-center rounded-lg bg-line/40 text-2xl" aria-hidden="true">
                    🖼️
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words">{msg.text || t('execution.panel.phone.photo')}</div>
                {msg.kind === 'text' && msg.keyboard && <TelegramKeyboardView message={msg} />}
                <div className="mt-0.5 text-right text-[8.5px] text-muted/70">{formatTimeRu(msg.at)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
