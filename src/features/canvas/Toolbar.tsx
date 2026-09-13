/**
 * Тулбар Canvas: возврат, название проекта, undo/redo, статус autosave,
 * статус выполнения, Запустить/Стоп, переключатель Debug-панели.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/project-store';
import { useExecutionStore } from '@/store/execution-store';
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
  const saveState = useProjectStore((s) => s.saveState);
  const savedAt = useProjectStore((s) => s.savedAt);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);

  const status = useExecutionStore((s) => s.status);
  const running = useExecutionStore((s) => s.running);
  const run = useExecutionStore((s) => s.run);
  const stop = useExecutionStore((s) => s.stop);

  if (!project) return null;

  return (
    <div className="glass-strong z-20 flex items-center gap-3 border-b border-line/70 px-4 py-2.5">
      <Link to="/dashboard" className="btn-ghost !px-2.5 !py-1.5 text-xs" title={t('common.back')}>
        ←
      </Link>

      <input
        className="input-dark max-w-[240px] !border-transparent !bg-transparent !px-2 text-sm font-semibold hover:!border-line focus:!border-cyan-400/50"
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

      <div className="flex-1" />

      {/* Autosave */}
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
