/**
 * Журнал действий пространства (подэтап 5.9E, русский интерфейс).
 *
 * Только чтение: кто, когда и какое действие совершил. Записи создаёт
 * только сервер — пользовательских способов добавить, изменить или удалить
 * запись нет. Метаданные уже прошли санитайзер (секреты скрыты).
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createServerApi, type AuditEntry } from '@/lib/server-api';
import { formatDateTimeRu } from '@/lib/utils';

const api = createServerApi();

const PAGE_SIZE = 25;

/**
 * Обёртка для Дашборда: сама находит рабочее пространство. Если сервер
 * недоступен или пользователь не вошёл — раздел просто не показывается.
 */
export function AuditLogSection() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void api
      .workspaces()
      .then((list) => {
        if (alive) setWorkspaceId(list[0]?.id ?? null);
      })
      .catch(() => {
        /* офлайн или нет входа — раздел скрыт */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (workspaceId === null) return null;
  return <AuditLog workspaceId={workspaceId} />;
}

export function AuditLog({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [actionFilter, setActionFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(
    async (action: string, replace: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const offset = replace ? 0 : entries.length;
        const list = await api.audit(workspaceId, {
          ...(action !== '' ? { action } : {}),
          limit: PAGE_SIZE,
          offset,
        });
        setEntries((prev) => (replace ? list : [...prev, ...list]));
        setHasMore(list.length === PAGE_SIZE);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, entries.length],
  );

  useEffect(() => {
    void load(actionFilter, true);
  }, [workspaceId, actionFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const actionGroups = [
    { prefix: 'auth.', label: t('auditLog.group.auth') },
    { prefix: 'project.', label: t('auditLog.group.project') },
    { prefix: 'version.', label: t('auditLog.group.version') },
    { prefix: 'secret.', label: t('auditLog.group.secret') },
    { prefix: 'telegram.', label: t('auditLog.group.telegram') },
  ];

  return (
    <section className="rounded-xl border border-line bg-panel/60 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold">{t('auditLog.title')}</h2>
        <span className="text-[10px] text-muted/70">{t('auditLog.readonly')}</span>
        <select
          className="input-dark ml-auto !w-auto !py-1 text-[11px]"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        >
          <option value="">{t('auditLog.filter.all')}</option>
          {actionGroups.map((g) => (
            <option key={g.prefix} value={g.prefix}>
              {g.label}
            </option>
          ))}
        </select>
        <button className="btn-ghost !px-2 !py-1 text-[10px]" onClick={() => void load(actionFilter, true)}>
          {t('auditLog.refresh')}
        </button>
      </div>

      {error !== null && <div className="mb-2 text-xs text-red-300">{error}</div>}
      {!loading && entries.length === 0 && <div className="text-xs text-muted/70">{t('auditLog.empty')}</div>}

      <div className="space-y-1">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-lg border border-line/50 bg-abyss/40 px-3 py-1.5 text-[11px]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="font-mono text-[10px] text-muted/70">{formatDateTimeRu(entry.createdAt)}</span>
              <span className="font-bold">{t(`auditLog.actions.${entry.action}`, { defaultValue: entry.action })}</span>
              <span className="text-muted">
                {entry.actorUserId !== null
                  ? `${t('auditLog.actor.user')} ${entry.actorUserId.slice(0, 8)}…`
                  : t('auditLog.actor.system')}
              </span>
              {entry.targetType !== null && (
                <span className="rounded border border-line/40 px-1.5 py-0.5 font-mono text-[10px] text-muted/80">
                  {entry.targetType}
                  {entry.targetId !== null ? `: ${entry.targetId.slice(0, 8)}…` : ''}
                </span>
              )}
            </div>
            {entry.metadata !== null && Object.keys(entry.metadata).length > 0 && (
              <pre className="log-json mt-1">{JSON.stringify(entry.metadata)}</pre>
            )}
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          className="btn-ghost mt-2 w-full justify-center !py-1.5 text-[11px]"
          disabled={loading}
          onClick={() => void load(actionFilter, false)}
        >
          {loading ? t('auditLog.loading') : t('auditLog.more')}
        </button>
      )}
    </section>
  );
}
