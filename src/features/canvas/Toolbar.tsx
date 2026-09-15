/**
 * Тулбар Canvas (Этап 2, подэтап B).
 *
 * Возврат, название проекта, тип, undo/redo, масштаб (−, %, +, вписать),
 * поиск по схеме, режим «Черновик / Живой», переключатель эффектов,
 * статус автосохранения, статус выполнения, Запустить/Стоп, кнопка
 * Debug-панели.
 *
 * Название/автосохранение/undo/redo/запуск — из фундамента;
 * масштаб, поиск по схеме, режим и эффекты добавлены в подэтапе B.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReactFlow, useViewport } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/project-store';
import { useExecutionStore } from '@/store/execution-store';
import { useTutorialStore } from '@/store/tutorial-store';
import { useUiStore } from '@/store/ui-store';
import { blockRegistry } from '@/core/registry/block-registry';
import { contextHelp } from '@/academy/search';
import { nodeMatchesQuery } from './library-utils';
import { cn, formatDateRu } from '@/lib/utils';
import type { ExecutionStatus } from '@/core/types/runtime';

const STATUS_STYLES: Record<ExecutionStatus, string> = {
  idle: '',
  waiting: 'status-waiting',
  running: 'status-running',
  success: 'status-success',
  error: 'status-error',
  stopped: 'status-stopped',
};

export function Toolbar({ onToggleDebug }: { onToggleDebug: () => void }) {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const renameProject = useProjectStore((s) => s.renameProject);
  const nodes = useProjectStore((s) => s.nodes);
  const selectedNodeId = useProjectStore((s) => s.selectedNodeId);
  const serverSession = useProjectStore((s) => s.serverSession);
  const saveState = useProjectStore((s) => s.saveState);
  const savedAt = useProjectStore((s) => s.savedAt);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);

  const canvasMode = useUiStore((s) => s.canvasMode);
  const setCanvasMode = useUiStore((s) => s.setCanvasMode);
  const effectsMode = useUiStore((s) => s.effectsMode);
  const toggleEffects = useUiStore((s) => s.toggleEffects);
  const focusMode = useUiStore((s) => s.focusMode);
  const toggleFocusMode = useUiStore((s) => s.toggleFocusMode);
  const schemaQuery = useUiStore((s) => s.schemaQuery);
  const setSchemaQuery = useUiStore((s) => s.setSchemaQuery);

  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();

  const status = useExecutionStore((s) => s.status);
  const running = useExecutionStore((s) => s.running);
  const run = useExecutionStore((s) => s.run);
  const stop = useExecutionStore((s) => s.stop);

  // Контекстные подсказки помощи (5.11F): зависят от состояния холста.
  const suggestions = useMemo(() => {
    const last = status === 'success' ? 'success' : status === 'error' ? 'error' : status === 'stopped' ? 'finished' : undefined;
    return contextHelp({
      nodeCount: nodes.length,
      hasSelection: selectedNodeId !== null,
      lastRunStatus: last,
    });
  }, [status, nodes.length, selectedNodeId]);

  // Количество узлов схемы, подходящих под поиск (0 при пустом запросе).
  const foundCount = useMemo(() => {
    const q = schemaQuery.trim();
    if (q === '') return 0;
    return nodes.filter((n) =>
      nodeMatchesQuery(n, q, (blockId) => {
        const def = blockRegistry.get(blockId);
        return def ? t(def.labelKey) : '';
      }),
    ).length;
  }, [nodes, schemaQuery, t]);

  const novice = useUiStore((s) => s.noviceMode);
  const teaching = useTutorialStore((s) => s.active);
  const [toolsOpen, setToolsOpen] = useState(false);
  if (!project) return null;

  return (
    <div data-novice={novice && !teaching} className="canvas-toolbar glass-strong z-20 flex shrink-0 items-center gap-2 border-b border-line/70 px-4 py-2.5">
      <Link to="/dashboard" className="btn-ghost !px-2.5 !py-1.5 text-xs" title={t('common.back')} aria-label={t('common.back')}>
        ←
      </Link>
      <details className="relative">
        <summary className="btn-ghost list-none !px-2.5 !py-1.5 text-xs" title={t('academy.toolbarHelp')} aria-label={t('academy.toolbarHelp')}>
          ?
        </summary>
        <div className="glass-strong absolute left-0 top-full z-40 mt-2 w-72 rounded-2xl border border-line/70 p-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">{t('academy.help.panelTitle')}</div>
          <div className="mb-2 flex gap-2">
            <Link to="/academy" className="btn-ghost flex-1 !py-1.5 text-xs">🎓 {t('academy.help.toAcademy')}</Link>
            <Link to="/academy/reference" className="btn-ghost flex-1 !py-1.5 text-xs">📚 {t('academy.help.toReference')}</Link>
          </div>
          <ul className="space-y-1.5">
            {suggestions.map((s) => (
              <li key={s.textKey}>
                <Link to={s.to} className="block rounded-lg border border-line/60 bg-abyss/40 px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-cyan-400/40 hover:text-ink">
                  💡 {t(s.textKey)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </details>

      <input
        className="input-dark max-w-[200px] !border-transparent !bg-transparent !px-2 text-sm font-semibold hover:!border-line focus:!border-cyan-400/50"
        value={project.name}
        onChange={(e) => renameProject(e.target.value)}
        title={t('common.name')} aria-label={t('common.name')}
      />

      <span className="canvas-toolbar-kind status-chip !text-[10.5px]">{t(`dashboard.kinds.${project.kind}`)}</span>

      <div className="mx-1 h-5 w-px bg-line" />

      <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={undo} disabled={!canUndo} title={t('canvas.toolbar.undo')} aria-label={t('canvas.toolbar.undo')}>
        ↩
      </button>
      <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={redo} disabled={!canRedo} title={t('canvas.toolbar.redo')} aria-label={t('canvas.toolbar.redo')}>
        ↪
      </button>

      <div className="mx-1 h-5 w-px bg-line" />

      <button data-testid="toolbar-tools-toggle" aria-expanded={toolsOpen} aria-controls="canvas-toolbar-tools"
        title={t('canvas.panels.tools')} className="canvas-tools-toggle btn-ghost !py-1.5 text-xs" onClick={() => setToolsOpen(!toolsOpen)}>{t('canvas.panels.tools')}</button>
      <div id="canvas-toolbar-tools" className="canvas-toolbar-tools" data-open={toolsOpen || (!novice && !teaching)}>
      <button className="btn-ghost text-xs" title={t('novice.modeHint')} aria-pressed={novice} onClick={() => useUiStore.getState().setNoviceMode(!novice)}>{t(novice ? 'novice.advanced' : 'novice.simple')}</button>
      {/* Масштаб */}
      <div className="flex items-center">
        <button className="btn-ghost !px-2 !py-1.5 text-xs" onClick={() => zoomOut()} title={t('canvas.toolbar.zoomOut')} aria-label={t('canvas.toolbar.zoomOut')}>
          −
        </button>
        <span className="w-11 text-center text-[11px] tabular-nums text-muted">{Math.round(zoom * 100)}%</span>
        <button className="btn-ghost !px-2 !py-1.5 text-xs" onClick={() => zoomIn()} title={t('canvas.toolbar.zoomIn')} aria-label={t('canvas.toolbar.zoomIn')}>
          +
        </button>
        <button className="btn-ghost !px-2 !py-1.5 text-xs" onClick={() => void fitView()} title={t('canvas.toolbar.fitView')} aria-label={t('canvas.toolbar.fitView')}>
          ⤢
        </button>
      </div>

      {/* Поиск по схеме */}
      <div className="relative">
        <input
          className="input-dark !w-44 !py-1.5 text-xs"
          placeholder={t('canvas.toolbar.searchSchemaPlaceholder')}
          value={schemaQuery}
          onChange={(e) => setSchemaQuery(e.target.value)}
        />
        {schemaQuery.trim() !== '' && (
          <span className="absolute -bottom-4 left-0 text-[10px] text-muted">
            {t('canvas.toolbar.found', { count: foundCount })}
          </span>
        )}
      </div>

      {/* Черновик / Живой */}
      <div className="flex overflow-hidden rounded-lg border border-line/70 text-[10.5px] font-semibold">
        <button
          className={cn('px-2 py-1.5 transition-colors', canvasMode === 'draft' ? 'bg-cyan-400/15 text-cyan-100' : 'text-muted hover:text-ink')}
          title={t('canvas.toolbar.draft')} aria-label={t('canvas.toolbar.draft')} aria-pressed={canvasMode === 'draft'}
          onClick={() => setCanvasMode('draft')}
        >
          {t('canvas.toolbar.draft')}
        </button>
        <button
          className={cn('px-2 py-1.5 transition-colors', canvasMode === 'live' ? 'bg-emerald-400/15 text-emerald-200' : 'text-muted hover:text-ink')}
          title={t('canvas.toolbar.live')} aria-label={t('canvas.toolbar.live')} aria-pressed={canvasMode === 'live'}
          onClick={() => setCanvasMode('live')}
        >
          {t('canvas.toolbar.live')}
        </button>
      </div>

      {/* Режим визуальных эффектов: полные / уменьшенные / выключены */}
      <button
        className={cn(
          'btn-ghost !px-2.5 !py-1.5 text-xs',
          effectsMode !== 'off' && '!border-cyan-400/40 !text-cyan-200',
        )}
        onClick={toggleEffects}
        title={t(`canvas.toolbar.effects.${effectsMode}`)} aria-label={t(`canvas.toolbar.effects.${effectsMode}`)}
        data-testid="effects-mode"
        data-effects-mode={effectsMode}
      >
        {effectsMode === 'full' ? '◉' : effectsMode === 'reduced' ? '◐' : '○'}
      </button>

      {/* Режим фокуса */}
      <button
        className={cn('btn-ghost !px-2.5 !py-1.5 text-xs', focusMode && '!border-amber-400/50 !text-amber-200')}
        aria-pressed={focusMode}
        onClick={toggleFocusMode}
        title={t('canvas.toolbar.focus')} aria-label={t('canvas.toolbar.focus')}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="4" /><path d="M8 0v4m0 8v4M0 8h4m8 0h4" /></svg>
      </button>

      </div>
      <div className="flex-1" />

      {/* Автосохранение */}
      {!serverSession && <span className={cn('text-[11px]', saveState === 'error' ? 'text-red-300' : 'text-muted')}>
        {saveState === 'saving' && t('common.saving')}
        {saveState === 'saved' && savedAt && t('canvas.save.saved', { time: formatDateRu(savedAt) })}
        {saveState === 'error' && '⚠️'}
        {saveState === 'idle' && t('canvas.save.idle')}
      </span>}

      {/* Статус выполнения */}
      <span className={cn('status-chip', STATUS_STYLES[status])}>
        <span className="status-dot" />
        {t(`execution.status.${status}`)}
      </span>

      {/* Запустить / Стоп */}
      <button
        className={cn(running ? 'btn-ghost !border-red-400/50 !text-red-300' : 'btn-primary !py-2 !text-sm')}
        data-tutorial="run"
        data-testid="run-button"
        title={t(running ? 'common.stop' : 'common.run')} aria-label={t(running ? 'common.stop' : 'common.run')}
        disabled={!running && nodes.length === 0}
        onClick={() => {
          if (running) { stop(); return; }
          if (!teaching) {
            const revealResult = !useUiStore.getState().debugOpen;
            useUiStore.getState().setDebugOpen(true);
            const hasTelegram = nodes.some((n) => n.data.blockId.startsWith('telegram.'));
            const hasWeb = nodes.some((n) => n.data.blockId.startsWith('web.'));
            if (revealResult) useExecutionStore.getState().setPanelTab(hasTelegram ? 'chat' : hasWeb ? 'web' : 'simulator');
          }
          void run();
        }}
      >
        {running ? '⏹ ' + t('common.stop') : '▶ ' + t('common.run')}
      </button>

      <button className="btn-ghost !px-2.5 !py-1.5 text-xs" data-testid="debug-toggle" data-tutorial="debug-toggle" onClick={onToggleDebug} title={t('execution.panel.title')} aria-label={t('execution.panel.title')}>
        ▤
      </button>
    </div>
  );
}
