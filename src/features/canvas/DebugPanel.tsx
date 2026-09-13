/**
 * Debug-панель: Симулятор (запуск схемы), Чат Telegram (outbox),
 * Журнал выполнения (LOG), История (execution history).
 *
 * Архитектурно заложены также BREAKPOINT и детальнее DEBUG UI — ROADMAP.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useExecutionStore } from '@/store/execution-store';
import { formatTimeRu, safeStringify, translateError } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { LogEntry } from '@/core/types/runtime';

type Tab = 'simulator' | 'chat' | 'log' | 'history';

export function DebugPanel({ open }: { open: boolean }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('simulator');

  const running = useExecutionStore((s) => s.running);
  const run = useExecutionStore((s) => s.run);
  const stop = useExecutionStore((s) => s.stop);
  const reset = useExecutionStore((s) => s.reset);
  const status = useExecutionStore((s) => s.status);

  if (!open) return null;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'simulator', label: t('execution.panel.tabs.simulator') },
    { id: 'chat', label: t('execution.panel.tabs.chat') },
    { id: 'log', label: t('execution.panel.tabs.log') },
    { id: 'history', label: t('execution.panel.tabs.history') },
  ];

  return (
    <div className="glass-strong z-20 border-t border-line/70">
      <div className="flex items-center gap-1 px-4 pt-2">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={cn(
              'rounded-t-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              tab === tb.id
                ? 'bg-cyan-400/10 text-cyan-200 shadow-[inset_0_1px_0_rgba(34,211,238,0.4)]'
                : 'text-muted hover:text-ink',
            )}
          >
            {tb.label}
          </button>
        ))}
        <div className="flex-1" />
        <span className={cn('status-chip mr-2', `status-${status}`)}>
          <span className="status-dot" />
          {t(`execution.status.${status}`)}
        </span>
        {running ? (
          <button className="btn-ghost !px-3 !py-1 !text-xs !border-red-400/50 !text-red-300" onClick={stop}>
            ⏹ {t('common.stop')}
          </button>
        ) : (
          <button className="btn-primary !px-3 !py-1 !text-xs" onClick={() => void run()}>
            ▶ {t('common.run')}
          </button>
        )}
        <button className="btn-ghost !px-3 !py-1 !text-xs" onClick={reset} title={t('landing.playground.reset')}>
          ⟲
        </button>
      </div>

      <div className="h-[190px] overflow-y-auto px-4 pb-3">
        {tab === 'simulator' && <SimulatorTab />}
        {tab === 'chat' && <ChatTab />}
        {tab === 'log' && <LogTab />}
        {tab === 'history' && <HistoryTab />}
      </div>
    </div>
  );
}

/* ---------------- Симулятор ---------------- */

function SimulatorTab() {
  const { t } = useTranslation();
  const payload = useExecutionStore((s) => s.payload);
  const setPayload = useExecutionStore((s) => s.setPayload);

  return (
    <div className="space-y-3 pt-2">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted">{t('execution.panel.simulator.source')}</span>
          <select
            className="input-dark"
            value={payload.source}
            onChange={(e) => setPayload({ source: e.target.value as 'telegram' | 'web' })}
          >
            <option value="telegram">{t('execution.panel.simulator.sourceTelegram')}</option>
            <option value="web">{t('execution.panel.simulator.sourceWeb')}</option>
          </select>
        </label>
        {payload.source === 'telegram' ? (
          <>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted">{t('execution.panel.simulator.text')}</span>
              <input
                className="input-dark"
                value={payload.text}
                onChange={(e) => setPayload({ text: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted">{t('execution.panel.simulator.command')}</span>
              <input
                className="input-dark"
                value={payload.command}
                placeholder="/start"
                onChange={(e) => setPayload({ command: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted">{t('execution.panel.simulator.userId')}</span>
                <input
                  className="input-dark"
                  type="number"
                  value={payload.userId}
                  onChange={(e) => setPayload({ userId: Number(e.target.value) })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] text-muted">{t('execution.panel.simulator.chatId')}</span>
                <input
                  className="input-dark"
                  type="number"
                  value={payload.chatId}
                  onChange={(e) => setPayload({ chatId: Number(e.target.value) })}
                />
              </label>
            </div>
          </>
        ) : (
          <label className="block sm:col-span-3">
            <span className="mb-1 block text-[11px] text-muted">{t('execution.panel.simulator.webJson')}</span>
            <textarea
              className="input-dark h-16 resize-none font-mono text-xs"
              value={payload.webJson}
              onChange={(e) => setPayload({ webJson: e.target.value })}
            />
          </label>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-muted/70">{t('execution.panel.simulator.hint')}</p>
    </div>
  );
}

/* ---------------- Чат Telegram (outbox) ---------------- */

function ChatTab() {
  const { t } = useTranslation();
  const outbox = useExecutionStore((s) => s.outbox);
  const chatEcho = useExecutionStore((s) => s.chatEcho);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [outbox, chatEcho]);

  if (outbox.length === 0 && !chatEcho) {
    return <div className="pt-4 text-xs text-muted/70">{t('execution.panel.chat.empty')}</div>;
  }

  return (
    <div ref={ref} className="flex flex-col gap-2 pt-2">
      {chatEcho && (
        <div>
          <div className="mb-0.5 text-[10px] text-muted">{t('execution.panel.chat.user')}</div>
          <div className="chat-bubble chat-bubble--user">{chatEcho}</div>
        </div>
      )}
      {outbox.map((m) => (
        <div key={m.id}>
          <div className="mb-0.5 text-[10px] text-muted">
            {t('execution.panel.chat.bot')} · {formatTimeRu(m.at)}
          </div>
          <div className="chat-bubble chat-bubble--bot">
            {m.kind === 'photo' ? `📷 ${t('execution.panel.chat.photo')}` : m.text}
            {m.kind === 'photo' && m.text ? ` — ${m.text}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Журнал (LOG) ---------------- */

const LEVEL_COLORS: Record<LogEntry['level'], string> = {
  debug: 'text-slate-400',
  info: 'text-cyan-300',
  warn: 'text-amber-300',
  error: 'text-red-300',
};

function LogTab() {
  const { t } = useTranslation();
  const logs = useExecutionStore((s) => s.logs);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  if (logs.length === 0) {
    return <div className="pt-4 text-xs text-muted/70">{t('execution.panel.log.empty')}</div>;
  }

  return (
    <div ref={ref} className="space-y-1.5 pt-2">
      {logs.map((entry) => (
        <div key={entry.id} className="rounded-lg border border-line/50 bg-abyss/40 px-2.5 py-1.5 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted/70">{formatTimeRu(entry.at)}</span>
            <span className={cn('font-bold uppercase tracking-wide text-[10px]', LEVEL_COLORS[entry.level])}>
              {entry.level}
            </span>
            <span className="flex-1 truncate font-medium">{translateError(entry.message)}</span>
          </div>
          {entry.data !== undefined && (
            <pre className="log-json">{safeStringify(entry.data, 1)}</pre>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- История выполнения ---------------- */

function HistoryTab() {
  const { t } = useTranslation();
  const history = useExecutionStore((s) => s.history);

  if (history.length === 0) {
    return <div className="pt-4 text-xs text-muted/70">{t('execution.panel.history.empty')}</div>;
  }

  return (
    <div className="space-y-1.5 pt-2">
      {history.map((h) => (
        <div key={h.id} className="flex items-center gap-3 rounded-lg border border-line/50 bg-abyss/40 px-3 py-2 text-[11px]">
          <span className="font-mono text-[10px] text-muted/70">{formatTimeRu(h.at)}</span>
          <span className={cn('status-chip !px-2 !py-0.5 !text-[10px]', `status-${h.status}`)}>
            <span className="status-dot" />
            {t(`execution.status.${h.status}`)}
          </span>
          <span className="flex-1 text-muted">
            {t('execution.panel.history.duration', { ms: h.durationMs })}
          </span>
          {h.error && <span className="truncate text-red-300">⛔ {translateError(h.error)}</span>}
        </div>
      ))}
    </div>
  );
}
