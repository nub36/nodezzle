/**
 * История исполнения проекта на сервере (подэтап 5.9E, русский интерфейс).
 *
 * Читает журнал исполнений через АПИ: список (новые → старые), фильтр по
 * статусу, пагинация «Показать ещё», детали шагов выбранного исполнения
 * (блок, статус, вход/выход, длительность, ошибка). Значения секретов в
 * сводках отсутствуют — сервер пропускает данные через санитайзер.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError, createServerApi, type ExecutionStepSummary, type ExecutionSummary } from '@/lib/server-api';
import { cn, formatDateTimeRu, formatDurationRu } from '@/lib/utils';

const api = createServerApi();

const PAGE_SIZE = 25;

const STATUS_CLASS: Record<string, string> = {
  queued: 'status-queued',
  running: 'status-running',
  success: 'status-success',
  error: 'status-error',
  stopped: 'status-stopped',
  timeout: 'status-timeout',
};

const STEP_STATUS_CLASS: Record<string, string> = {
  success: 'text-emerald-300',
  error: 'text-red-300',
  timeout: 'text-amber-300',
  skipped: 'text-muted/70',
};

export function ExecutionHistory({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [executions, setExecutions] = useState<ExecutionSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [steps, setSteps] = useState<ExecutionStepSummary[]>([]);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [notPublished, setNotPublished] = useState(false);

  const load = useCallback(
    async (status: string, replace: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const offset = replace ? 0 : executions.length;
        const list = await api.executions(projectId, {
          ...(status !== '' ? { status } : {}),
          limit: PAGE_SIZE,
          offset,
        });
        setExecutions((prev) => (replace ? list : [...prev, ...list]));
        setHasMore(list.length === PAGE_SIZE);
      } catch (err) {
        // Проект ещё не опубликован на сервере — это не ошибка, а состояние.
        if (err instanceof ApiClientError && (err.status === 404 || err.status === 401)) {
          setNotPublished(true);
          setExecutions([]);
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        setLoading(false);
      }
    },
    [projectId, executions.length],
  );

  useEffect(() => {
    setSelectedId(null);
    setSteps([]);
    void load(statusFilter, true);
    // начальная загрузка и смена фильтра
  }, [projectId, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const openSteps = async (id: string) => {
    if (selectedId === id) {
      setSelectedId(null);
      return;
    }
    setSelectedId(id);
    setStepsLoading(true);
    setSteps([]);
    try {
      setSteps(await api.executionSteps(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStepsLoading(false);
    }
  };

  return (
    <div className="space-y-2 pt-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted/70">
          {t('historyServer.title')}
        </span>
        <select
          className="input-dark !w-auto !py-1 text-[11px]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">{t('historyServer.filter.all')}</option>
          <option value="queued">{t('historyServer.filter.queued')}</option>
          <option value="running">{t('historyServer.filter.running')}</option>
          <option value="success">{t('historyServer.filter.success')}</option>
          <option value="error">{t('historyServer.filter.error')}</option>
          <option value="stopped">{t('historyServer.filter.stopped')}</option>
          <option value="timeout">{t('historyServer.filter.timeout')}</option>
        </select>
        <button className="btn-ghost !px-2 !py-0.5 text-[10px]" onClick={() => void load(statusFilter, true)}>
          {t('historyServer.refresh')}
        </button>
      </div>

      {error !== null && <div className="text-[11px] text-red-300">{error}</div>}
      {notPublished && <div className="text-xs text-muted/70">{t('historyServer.notPublished')}</div>}
      {!notPublished && !loading && executions.length === 0 && (
        <div className="text-xs text-muted/70">{t('historyServer.empty')}</div>
      )}

      {executions.map((run) => (
        <div key={run.id} className="rounded-lg border border-line/50 bg-abyss/40 px-3 py-2 text-[11px]">
          <button className="flex w-full items-center gap-3 text-left" onClick={() => void openSteps(run.id)}>
            <span className="font-mono text-[10px] text-muted/70">
              {run.startedAt !== null ? formatDateTimeRu(run.startedAt) : t('historyServer.queued')}
            </span>
            <span className={cn('status-chip !px-2 !py-0.5 !text-[10px]', STATUS_CLASS[run.status] ?? 'status-error')}>
              <span className="status-dot" />
              {t(`historyServer.status.${run.status}`, { defaultValue: run.status })}
            </span>
            <span className="text-muted">{t(`historyServer.source.${run.source}`, { defaultValue: run.source })}</span>
            <span className="flex-1 truncate text-muted">
              {run.durationMs !== null
                ? formatDurationRu(run.durationMs)
                : t('historyServer.notFinished')}
              {' '}· {run.stepCount} {t('historyServer.stepsCount')}
            </span>
            {run.errorCode !== null && (
              <span className="max-w-40 truncate text-red-300">⛔ {t(`errors.${run.errorCode}`, { defaultValue: run.errorCode })}</span>
            )}
            <span className="text-muted/70">{selectedId === run.id ? '▾' : '▸'}</span>
          </button>

          {selectedId === run.id && (
            <div className="mt-2 space-y-1 border-t border-line/40 pt-2">
              {stepsLoading && <div className="text-muted/70">{t('historyServer.stepsLoading')}</div>}
              {!stepsLoading && steps.length === 0 && (
                <div className="text-muted/70">{t('historyServer.noSteps')}</div>
              )}
              {steps.map((step) => (
                <div key={`${step.executionId}:${step.sequence}`} className="rounded border border-line/30 px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted/60">#{step.sequence}</span>
                    <span className="font-bold font-mono">{step.nodeId}</span>
                    <span className="font-mono text-[10px] text-muted/60">{step.blockType}</span>
                    <span className={cn('ml-auto font-bold uppercase text-[10px]', STEP_STATUS_CLASS[step.status] ?? 'text-muted')}>
                      {t(`historyServer.stepStatus.${step.status}`, { defaultValue: step.status })}
                    </span>
                    {step.durationMs !== null && (
                      <span className="font-mono text-[10px] text-muted/70">{formatDurationRu(step.durationMs)}</span>
                    )}
                  </div>
                  {step.inputSummary !== null && (
                    <pre className="log-json mt-1">{t('historyServer.input')}: {step.inputSummary}</pre>
                  )}
                  {step.outputSummary !== null && (
                    <pre className="log-json">{t('historyServer.output')}: {step.outputSummary}</pre>
                  )}
                  {step.errorCode !== null && (
                    <div className="text-red-300">⛔ {t(`errors.${step.errorCode}`, { defaultValue: step.errorCode })}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {hasMore && (
        <button
          className="btn-ghost w-full justify-center !py-1.5 text-[11px]"
          disabled={loading}
          onClick={() => void load(statusFilter, false)}
        >
          {loading ? t('historyServer.loading') : t('historyServer.more')}
        </button>
      )}
    </div>
  );
}
