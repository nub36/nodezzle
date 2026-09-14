/**
 * Панель подключения Telegram-бота (подэтап 5.8E, русский интерфейс).
 *
 * Токен вводится один раз в поле пароля и уходит только на сервер
 * (в шифрованное хранилище). После сохранения токен не показывается:
 * видны лишь имя секрета, имя/ник бота и статус. В `localStorage`
 * и в Project JSON токенов нет.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createServerApi, ApiClientError, type BotSummary, type SecretSummary } from '@/lib/server-api';
import { connectBot, replaceBotToken, botTokenRef } from './bot-connect-model';
import { useProjectStore } from '@/store/project-store';

const api = createServerApi();

export function TelegramBotPanel() {
  const { t } = useTranslation();
  const listProjects = useProjectStore((s) => s.listProjects);

  const [online, setOnline] = useState<boolean | null>(null); // null — проверка
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [secrets, setSecrets] = useState<SecretSummary[]>([]);
  const [secretName, setSecretName] = useState('TG_BOT_TOKEN');
  const [token, setToken] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [projectIds, setProjectIds] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const workspaces = await api.workspaces();
      const ws = workspaces[0];
      if (!ws) throw new ApiClientError(404, 'NOT_FOUND', 'нет пространства');
      setWorkspaceId(ws.id);
      const [botList, secretList] = await Promise.all([api.bots(ws.id), api.secrets(ws.id)]);
      setBots(botList);
      setSecrets(secretList);
      setOnline(true);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) setOnline(false);
      else setOnline(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void listProjects().then((projects) =>
      setProjectIds(projects.filter((p) => p.kind === 'telegram').map((p) => ({ id: p.id, name: p.name }))),
    );
  }, [refresh, listProjects]);

  const handleConnect = async () => {
    if (!workspaceId || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await connectBot(api, {
        workspaceId,
        secretName,
        token,
        projectId: projectId === '' ? null : projectId,
      });
      setToken(''); // токен больше не нужен и нигде не остаётся
      setNotice(t('telegramPanel.connected'));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleReplace = async (bot: BotSummary) => {
    if (!workspaceId) return;
    const next = window.prompt(t('telegramPanel.replacePrompt'));
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      await replaceBotToken(api, {
        workspaceId,
        botId: bot.id,
        secretName: `${secretName}_${new Date().toISOString().slice(0, 10)}`,
        token: next,
      });
      setNotice(t('telegramPanel.replaced'));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async (bot: BotSummary) => {
    if (!workspaceId) return;
    if (!window.confirm(t('telegramPanel.disconnectConfirm'))) return;
    await api.deleteBot(workspaceId, bot.id);
    setNotice(t('telegramPanel.disconnected'));
    await refresh();
  };

  if (online === null) {
    return <div className="glass mt-8 rounded-3xl p-6 text-sm text-muted">{t('telegramPanel.loading')}</div>;
  }

  if (online === false) {
    return (
      <div className="glass mt-8 rounded-3xl p-6">
        <div className="text-base font-bold">🤖 {t('telegramPanel.title')}</div>
        <p className="mt-2 text-sm text-muted">{t('telegramPanel.offline')}</p>
      </div>
    );
  }

  return (
    <div className="glass mt-8 rounded-3xl p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-bold">🤖 {t('telegramPanel.title')}</div>
          <p className="mt-1 text-xs text-muted">{t('telegramPanel.subtitle')}</p>
        </div>
      </div>

      {bots.length > 0 && (
        <ul className="mt-4 space-y-2">
          {bots.map((bot) => (
            <li key={bot.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-abyss/40 p-3">
              <span className="text-xl">{bot.status === 'connected' ? '🟢' : '⚪'}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {bot.botUsername ? `@${bot.botUsername}` : t('telegramPanel.noUsername')}
                  {bot.botName ? <span className="ml-2 text-muted">({bot.botName})</span> : null}
                </div>
                <div className="truncate text-xs text-muted">
                  {t('telegramPanel.tokenSecret')}: {botTokenRef(bot, secrets) ?? '—'} ·{' '}
                  {t('telegramPanel.webhook')}: {bot.webhookPath.slice(0, 8)}…
                </div>
              </div>
              <button className="btn-ghost" disabled={busy} onClick={() => void handleReplace(bot)}>
                {t('telegramPanel.replace')}
              </button>
              <button className="btn-ghost" disabled={busy} onClick={() => void handleDisconnect(bot)}>
                {t('telegramPanel.disconnect')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="block">
          <div className="mb-1 text-xs font-medium text-muted">{t('telegramPanel.secretName')}</div>
          <input
            className="w-full rounded-xl border border-line bg-abyss/40 px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
            value={secretName}
            onChange={(e) => setSecretName(e.target.value)}
            maxLength={120}
          />
        </label>
        <label className="block md:col-span-2">
          <div className="mb-1 text-xs font-medium text-muted">{t('telegramPanel.token')}</div>
          <input
            type="password"
            autoComplete="off"
            placeholder={t('telegramPanel.tokenPlaceholder')}
            className="w-full rounded-xl border border-line bg-abyss/40 px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        <label className="block md:col-span-2">
          <div className="mb-1 text-xs font-medium text-muted">{t('telegramPanel.project')}</div>
          <select
            className="w-full rounded-xl border border-line bg-abyss/40 px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">{t('telegramPanel.noProject')}</option>
            {projectIds.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button className="btn-primary w-full" disabled={busy || token.trim() === ''} onClick={() => void handleConnect()}>
            {busy ? '…' : t('telegramPanel.connect')}
          </button>
        </div>
      </div>

      {notice ? <p className="mt-3 text-xs text-emerald-300">{notice}</p> : null}
      {error ? <p className="mt-3 text-xs text-red-300">{t('telegramPanel.errorPrefix')}: {error}</p> : null}
      <p className="mt-3 text-[11px] text-muted">{t('telegramPanel.privacy')}</p>
    </div>
  );
}
