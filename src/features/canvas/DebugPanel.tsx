/**
 * Debug-панель: Симулятор (запуск схемы), Чат Telegram (outbox),
 * Журнал выполнения (LOG), История (execution history).
 *
 * Архитектурно заложены также BREAKPOINT и детальнее DEBUG UI — ROADMAP.
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { readCallback } from '@/core/telegram/callback';
import { TelegramCallbackNotice } from './TelegramCallbackNotice';
import { buildTriggerPayload, useExecutionStore } from '@/store/execution-store';
import { helpRouteForError } from '@/academy/search';
import { formatTimeRu, safeStringify, translateError } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { LogEntry } from '@/core/types/runtime';
import { PhonePreview } from './PhonePreview';
import { WebPreview } from './WebPreview';
import { ExecutionHistory } from '@/features/history/ExecutionHistory';
import { useProjectStore } from '@/store/project-store';
import { blockRegistry } from '@/core/registry/block-registry';
import type { DebugPanelTab } from '@/lib/debug-tabs';

export function DebugPanel({ open, projectId }: { open: boolean; projectId: string }) {
  const { t } = useTranslation();
  // Вкладка живёт в сторе исполнения: её может переключать Академия.
  const tab = useExecutionStore((s) => s.panelTab);
  const setTab = useExecutionStore((s) => s.setPanelTab);

  const running = useExecutionStore((s) => s.running);
  const run = useExecutionStore((s) => s.run);
  const stop = useExecutionStore((s) => s.stop);
  const reset = useExecutionStore((s) => s.reset);
  const status = useExecutionStore((s) => s.status);

  if (!open) return null;

  const tabs: Array<{ id: DebugPanelTab; label: string }> = [
    { id: 'simulator', label: t('execution.panel.tabs.simulator') },
    { id: 'chat', label: t('execution.panel.tabs.chat') },
    { id: 'phone', label: t('execution.panel.tabs.phone') },
    { id: 'web', label: t('execution.panel.tabs.web') },
    { id: 'ports', label: t('execution.panel.tabs.ports') },
    { id: 'log', label: t('execution.panel.tabs.log') },
    { id: 'history', label: t('execution.panel.tabs.history') },
  ];

  return (
    <div className="canvas-debug glass-strong z-20 shrink-0 border-t border-line/70" data-tutorial="debug">
      <div className="canvas-debug-tabs flex items-center gap-1 overflow-x-auto px-4 pt-2">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            data-testid={`debug-tab-${tb.id}`}
            aria-pressed={tab === tb.id}
            data-tutorial={tb.id === 'simulator' || tb.id === 'chat' || tb.id === 'history' ? `tab-${tb.id}` : undefined}
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
          <button className="btn-primary !px-3 !py-1 !text-xs" data-tutorial="run" onClick={() => void run()}>
            ▶ {t('common.run')}
          </button>
        )}
        <button className="btn-ghost !px-3 !py-1 !text-xs" onClick={reset} title={t('landing.playground.reset')}>
          ⟲
        </button>
      </div>

      <div className="canvas-debug-body h-[190px] overflow-auto px-4 pb-3">
        {tab === 'simulator' && <SimulatorTab />}
        {tab === 'chat' && <ChatTab />}
        {tab === 'phone' && <PhonePreview />}
        {tab === 'web' && <WebPreview />}
        {tab === 'ports' && <PortsTab />}
        {tab === 'log' && <LogTab />}
        {tab === 'history' && <HistoryTab projectId={projectId} />}
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
              <span className="mb-1 block text-[11px] text-muted">{t('execution.panel.simulator.telegramEvent')}</span>
              <select className="input-dark" aria-label={t('execution.panel.simulator.telegramEvent')}
                value={payload.telegramEvent ?? 'message'} onChange={(e) => setPayload({ telegramEvent: e.target.value as 'message' | 'callback_query' })}>
                <option value="message">{t('execution.panel.simulator.messageEvent')}</option>
                <option value="callback_query">{t('execution.panel.simulator.callbackEvent')}</option>
              </select>
            </label>
            {payload.telegramEvent === 'callback_query' ? <>
              {(['callbackId', 'callbackData', 'messageId'] as const).map((key) => <label key={key} className="block">
                <span className="mb-1 block text-[11px] text-muted">{t(`execution.panel.simulator.${key}`)}</span>
                <input className="input-dark" type={key === 'messageId' ? 'number' : 'text'} value={payload[key] ?? ''}
                  onChange={(e) => setPayload({ [key]: key === 'messageId' ? Number(e.target.value) : e.target.value })} />
              </label>)}
            </> : <>
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
            </>}
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
      {payload.source === 'telegram' && payload.telegramEvent === 'callback_query' && !readCallback(buildTriggerPayload(payload, ['telegram_events'])) &&
        <p role="alert" className="text-xs text-red-300">{t('errors.ERR_TELEGRAM_CALLBACK')}</p>}
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
          <div data-testid="simulator-chat-user" className="chat-bubble chat-bubble--user">{chatEcho}</div>
        </div>
      )}
      {outbox.map((m) => m.kind === 'callback_answer' ? <TelegramCallbackNotice key={m.id} answer={m} /> : (
        <div key={m.id}>
          <div className="mb-0.5 text-[10px] text-muted">
            {t('execution.panel.chat.bot')} · {formatTimeRu(m.at)}
          </div>
          <div data-testid="simulator-chat-bot" data-chat-id={m.chatId} className="chat-bubble chat-bubble--bot">
            {m.kind === 'photo' ? `📷 ${t('execution.panel.chat.photo')}` : m.text}
            {m.kind === 'photo' && m.text ? ` — ${m.text}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Значения портов (Этап 2, подэтап I ч. 2) ---------------- */

const NODE_STATUS_CHIP: Record<string, string> = {
  idle: 'status-stopped',
  running: 'status-running',
  success: 'status-success',
  error: 'status-error',
  skipped: 'status-stopped',
};

function PortsTab() {
  const { t } = useTranslation();
  const nodeInfo = useExecutionStore((s) => s.nodeInfo);
  const nodes = useProjectStore((s) => s.nodes);
  const runs = nodes.filter((n) => nodeInfo[n.id]);

  if (runs.length === 0) {
    return <div className="pt-4 text-xs text-muted/70">{t('execution.panel.ports.empty')}</div>;
  }

  const renderValues = (values: Record<string, unknown>, direction: 'input' | 'output') =>
    Object.entries(values).map(([port, value]) => (
      <div key={port} className="flex items-baseline gap-2">
        <span className="shrink-0 font-mono text-[10px] text-cyan-300/80">{port}:</span>
        <span data-testid={`${direction}-${port}`} className="min-w-0 flex-1 break-all font-mono text-[10px] text-ink/80">{safeStringify(value)}</span>
      </div>
    ));

  return (
    <div className="space-y-2 pt-2">
      {runs.map((n) => {
        const info = nodeInfo[n.id];
        const def = blockRegistry.get(n.data.blockId);
        const label = n.data.label ?? (def ? t(def.labelKey) : n.data.blockId);
        return (
          <div key={n.id} data-testid={`debug-node-${n.data.blockId}`} data-node-id={n.id} data-status={info.status} className="rounded-lg border border-line/50 bg-abyss/40 px-3 py-2">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-xs">{def?.ui?.icon}</span>
              <span className="text-[11px] font-semibold">{label}</span>
              <span className={cn('status-chip !px-2 !py-0 !text-[10px]', NODE_STATUS_CHIP[info.status])}>
                <span className="status-dot" />
                {t(`execution.status.${info.status}`)}
              </span>
              <span className="ml-auto font-mono text-[10px] text-muted/70">{info.durationMs} ms</span>
            </div>
            {Object.keys(info.inputs).length > 0 && (
              <div className="mb-1">
                <div className="mb-0.5 text-[9.5px] font-bold uppercase tracking-wider text-muted/70">
                  {t('execution.panel.ports.inputs')}
                </div>
                {renderValues(info.inputs, 'input')}
              </div>
            )}
            {Object.keys(info.outputs).length > 0 && (
              <div>
                <div className="mb-0.5 text-[9.5px] font-bold uppercase tracking-wider text-muted/70">
                  {t('execution.panel.ports.outputs')}
                </div>
                {renderValues(info.outputs, 'output')}
              </div>
            )}
            {info.error && <div className="mt-1 text-[10px] text-red-300">⛔ {translateError(info.error)}</div>}
          </div>
        );
      })}
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
        <div key={entry.id} data-testid="execution-log-entry" className="rounded-lg border border-line/50 bg-abyss/40 px-2.5 py-1.5 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted/70">{formatTimeRu(entry.at)}</span>
            <span className={cn('font-bold uppercase tracking-wide text-[10px]', LEVEL_COLORS[entry.level])}>
              {entry.level}
            </span>
            <span className="flex-1 truncate font-medium">{translateError(entry.message)}</span>
            {entry.message.startsWith('ERR_') && (
              <Link
                to={helpRouteForError(entry.message)}
                className="shrink-0 text-[10px] text-cyan-300 hover:underline"
                title={t('execution.panel.log.howToFix')}
              >
                {t('execution.panel.log.howToFix')}
              </Link>
            )}
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

function HistoryTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const history = useExecutionStore((s) => s.history);

  return (
    <div className="space-y-1.5 pt-2">
      {/* Серверная история исполнения (журналы АПИ/Телеграма) */}
      <ExecutionHistory projectId={projectId} />
      {/* Локальная история симулятора этого браузера */}
      <div className="pt-2 text-[10px] font-bold uppercase tracking-wide text-muted/70">
        {t('execution.panel.history.localTitle')}
      </div>
      {history.length === 0 && (
        <div className="text-xs text-muted/70">{t('execution.panel.history.empty')}</div>
      )}
      {history.map((h) => (
        <div key={h.id} data-testid="local-history-entry" data-status={h.status} className="flex items-center gap-3 rounded-lg border border-line/50 bg-abyss/40 px-3 py-2 text-[11px]">
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
