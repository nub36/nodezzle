/**
 * Playground на главной странице: мини-демонстрация NODEZZLE без регистрации.
 * Сообщение → Логика → Ответ: пользователь вводит сообщение, нажимает
 * «Запустить», видит, как данные текут по соединениям, и получает
 * ответ в демонстрационном Telegram-чате.
 *
 * Полноценный интерактивный редактор Playground — ROADMAP (этап 2).
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: number;
  from: 'user' | 'bot';
  text: string;
}

type Phase = 'idle' | 'running' | 'done';

export function Playground() {
  const { t } = useTranslation();
  const [message, setMessage] = useState('привет');
  const [phase, setPhase] = useState<Phase>('idle');
  const [activeStep, setActiveStep] = useState<number>(-1);
  const [doneSteps, setDoneSteps] = useState<number[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const chatRef = useRef<HTMLDivElement>(null);
  const msgId = useRef(0);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const pushChat = (from: ChatMessage['from'], text: string) => {
    msgId.current += 1;
    setChat((prev) => [...prev, { id: msgId.current, from, text }]);
  };

  const after = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const run = () => {
    if (phase === 'running') return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setChat([]);
    setDoneSteps([]);
    setPhase('running');

    const text = message.trim() || 'привет';
    const reply = /привет|hi|hello|здрав/i.test(text)
      ? 'Привет! Это NODEZZLE 🤖 Собрано из деталей, без кода.'
      : 'Напишите «привет» — и я отвечу. Это логическая деталь ⚙️';

    after(150, () => {
      pushChat('user', text);
      setActiveStep(0);
    });
    after(900, () => {
      setDoneSteps([0]);
      setActiveStep(1);
    });
    after(1700, () => {
      setDoneSteps([0, 1]);
      setActiveStep(2);
    });
    after(2300, () => {
      pushChat('bot', reply);
    });
    after(2600, () => {
      setDoneSteps([0, 1, 2]);
      setActiveStep(-1);
      setPhase('done');
    });
  };

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase('idle');
    setActiveStep(-1);
    setDoneSteps([]);
    setChat([]);
  };

  const stepChip = (index: number, icon: string, label: string) => (
    <div
      className={cn(
        'play-chip flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold',
        activeStep === index && 'active',
        doneSteps.includes(index) && 'done',
      )}
    >
      <span>{icon}</span>
      {label}
    </div>
  );

  return (
    <section id="playground" className="relative mx-auto w-full max-w-5xl px-6 py-20">
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-bold tracking-tight">{t('landing.playground.title')}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          {t('landing.playground.lead')}
        </p>
      </div>

      <div className="glass grid gap-6 rounded-3xl p-6 md:grid-cols-2 md:p-8">
        {/* Левая часть: детали + запуск */}
        <div className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3">
            {stepChip(0, '📨', t('landing.playground.steps.message'))}
            <div className="relative h-6 w-px bg-gradient-to-b from-cyan-400/60 to-fuchsia-400/60">
              <div
                className={cn(
                  'absolute -left-[3px] h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.9)] transition-all duration-500',
                  phase === 'running' || phase === 'done' ? 'top-full' : 'top-0',
                )}
              />
            </div>
            {stepChip(1, '⚙️', t('landing.playground.steps.logic'))}
            <div className="relative h-6 w-px bg-gradient-to-b from-fuchsia-400/60 to-emerald-400/60">
              <div
                className={cn(
                  'absolute -left-[3px] h-2 w-2 rounded-full bg-fuchsia-300 shadow-[0_0_10px_rgba(232,121,249,0.9)] transition-all duration-500',
                  phase === 'running' || phase === 'done' ? 'top-full' : 'top-0',
                )}
              />
            </div>
            {stepChip(2, '💬', t('landing.playground.steps.reply'))}
          </div>

          <div className="mt-auto space-y-3">
            <label className="block text-xs font-medium text-muted">
              {t('landing.playground.messageLabel')}
            </label>
            <input
              className="input-dark"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run()}
              disabled={phase === 'running'}
            />
            <div className="flex gap-3">
              <button className="btn-primary flex-1 justify-center" onClick={run} disabled={phase === 'running'}>
                {phase === 'running' ? '⏳' : '▶️'} {t('landing.playground.run')}
              </button>
              <button className="btn-ghost" onClick={reset}>
                {t('landing.playground.reset')}
              </button>
            </div>
          </div>
        </div>

        {/* Правая часть: демо-чат */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-abyss/60">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/25 text-xs">🤖</span>
            <div>
              <div className="text-xs font-semibold">{t('landing.playground.chat.title')}</div>
            </div>
          </div>
          <div ref={chatRef} className="flex h-64 flex-col gap-2 overflow-y-auto p-4">
            {chat.length === 0 ? (
              <div className="m-auto text-xs text-muted/70">{t('landing.playground.chat.empty')}</div>
            ) : (
              chat.map((m) => (
                <div
                  key={m.id}
                  className={cn('chat-bubble', m.from === 'user' ? 'chat-bubble--user' : 'chat-bubble--bot')}
                >
                  {m.text}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
