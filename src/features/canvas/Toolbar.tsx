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

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useReactFlow, useViewport } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/project-store';
import { useExecutionStore } from '@/store/execution-store';
import { useUiStore } from '@/store/ui-store';
import { blockRegistry } from '@/core/registry/block-registry';
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
  const saveState = useProjectStore((s) => s.saveState);
  const savedAt = useProjectStore((s) => s.savedAt);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);

  const canvasMode = useUiStore((s) => s.canvasMode);
  const setCanvasMode = useUiStore((s) => s.setCanvasMode);
  const effectsEnabled = useUiStore((s) => s.effectsEnabled);
  const toggleEffects = useUiStore((s) => s.toggleEffects);
  const schemaQuery = useUiStore((s) => s.schemaQuery);
  const setSchemaQuery = useUiStore((s) => s.setSchemaQuery);

  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();

  const status = useExecutionStore((s) => s.status);
  const running = useExecutionStore((s) => s.running);
  const run = useExecutionStore((s) => s.run);
  const stop = useExecutionStore((s) => s.stop);

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

  if (!project) return null;

  return (
    <div className="glass-strong z-20 flex items-center gap-2 border-b border-line/70 px-4 py-2.5">
      <Link to="/dashboard" className="btn-ghost !px-2.5 !py-1.5 text-xs" title={t('common.back')}>
        ←
      </Link>

      <input
        className="input-dark max-w-[200px] !border-transparent !bg-transparent !px-2 text-sm font-semibold hover:!border-line focus:!border-cyan-400/50"
        value={project.name}
        onChange={(e) => renameProject(e.target.value)}
        title={t('common.name')}
      />

      <span className="status-chip !text-[10.5px]">{t(`dashboard.kinds.${project.kind}`)}</span>

      <div className="mx-1 h-5 w-px bg-line" />

      <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={undo} disabled={!canUndo} title={t('canvas.toolbar.undo')}>
        ↩
      </button>
      <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={redo} disabled={!canRedo} title={t('canvas.toolbar.redo')}>
        ↪
      </button>

      <div className="mx-1 h-5 w-px bg-line" />

      {/* Масштаб */}
      <div className="flex items-center">
        <button className="btn-ghost !px-2 !py-1.5 text-xs" onClick={() => zoomOut()} title={t('canvas.toolbar.zoomOut')}>
          −
        </button>
        <span className="w-11 text-center text-[11px] tabular-nums text-muted">{Math.round(zoom * 100)}%</span>
        <button className="btn-ghost !px-2 !py-1.5 text-xs" onClick={() => zoomIn()} title={t('canvas.toolbar.zoomIn')}>
          +
        </button>
        <button className="btn-ghost !px-2 !py-1.5 text-xs" onClick={() => void fitView()} title={t('canvas.toolbar.fitView')}>
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
          onClick={() => setCanvasMode('draft')}
        >
          {t('canvas.toolbar.draft')}
        </button>
        <button
          className={cn('px-2 py-1.5 transition-colors', canvasMode === 'live' ? 'bg-emerald-400/15 text-emerald-200' : 'text-muted hover:text-ink')}
          onClick={() => setCanvasMode('live')}
        >
          {t('canvas.toolbar.live')}
        </button>
      </div>

      {/* Эффекты выполнения */}
      <button
        className={cn('btn-ghost !px-2.5 !py-1.5 text-xs', effectsEnabled && '!border-cyan-400/40 !text-cyan-200')}
        onClick={toggleEffects}
        title={t('canvas.toolbar.effects')}
      >
        ✨
      </button>

      <div className="flex-1" />

      {/* Автосохранение */}
      <span className={cn('text-[11px]', saveState === 'error' ? 'text-red-300' : 'text-muted')}>
        {saveState === 'saving' && t('common.saving')}
        {saveState === 'saved' && savedAt && t('canvas.save.saved', { time: formatDateRu(savedAt) })}
        {saveState === 'error' && '⚠️'}
        {saveState === 'idle' && t('canvas.save.idle')}
      </span>

      {/* Статус выполнения */}
      <span className={cn('status-chip', STATUS_STYLES[status])}>
        <span className="status-dot" />
        {t(`execution.status.${status}`)}
      </span>

      {/* Запустить / Стоп */}
      <button
        className={cn(running ? 'btn-ghost !border-red-400/50 !text-red-300' : 'btn-primary !py-2 !text-sm')}
        onClick={() => (running ? stop() : void run())}
      >
        {running ? '⏹ ' + t('common.stop') : '▶ ' + t('common.run')}
      </button>

      <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={onToggleDebug} title={t('execution.panel.title')}>
        🐞
      </button>
    </div>
  );
}
