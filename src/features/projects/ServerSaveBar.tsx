import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { ServerSession } from '@/core/project/server-session';
import { useProjectStore } from '@/store/project-store';
import { useExecutionStore } from '@/store/execution-store';
import { projectStorage } from '@/core/project/storage';
import { newProjectCopy } from './project-copies';
import { formatDateRu } from '@/lib/utils';
export function ServerSaveBar({ session }: { session: ServerSession }) {
  const { t } = useTranslation();
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [message, setMessage] = useState('');
  const [copying, setCopying] = useState(false);
  const saveLocal = async () => {
    if (copying) return;
    setCopying(true); setMessage('');
    try {
      useProjectStore.getState().flushSave();
      const copy = newProjectCopy(session.getSnapshot().document);
      if (await projectStorage.get(copy.id)) throw new Error('COLLISION');
      await projectStorage.save(copy); setMessage('serverEditor.copied');
    } catch { setMessage('serverEditor.copyFailed'); }
    finally { setCopying(false); }
  };
  return <section aria-label={t('serverEditor.title')} className="max-h-[45dvh] shrink-0 overflow-y-auto border-b border-cyan-500/25 bg-slate-950 px-3 py-2 text-xs">
    <div className="flex flex-wrap items-center gap-2">
      <strong>{t('serverEditor.title')}</strong>
      <span role="status" data-testid="server-save-status" className={state.status === 'paused' ? 'text-amber-200' : 'text-cyan-200'}>{t(`serverEditor.status.${state.status}`)}</span>
      <button className="btn-ghost !px-2 !py-1 text-xs" disabled={state.status !== 'dirty'} onClick={() => void session.flush()}>{t('serverEditor.saveNow')}</button>
      <button className="btn-ghost !px-2 !py-1 text-xs" disabled={state.status === 'saving' || state.checking} onClick={() => void session.inspect()}>{t('serverEditor.inspect')}</button>
      <button className="btn-ghost !px-2 !py-1 text-xs" disabled={copying} onClick={() => void saveLocal()}>{t('serverEditor.copyLocal')}</button>
      <details className="relative"><summary className="cursor-pointer">{t('serverEditor.helpTitle')}</summary><p className="max-w-xl py-2 text-muted">{t('serverEditor.help')}</p></details>
    </div>
    {state.error && <p role="alert" className="mt-1 text-amber-200">{t(`serverEditor.errors.${state.error}`)}</p>}
    {state.backupError && <p role="alert" className="text-red-300">{t('serverEditor.backupError')}</p>}
    {message && <p role="status">{t(message)}</p>}
    {state.remote && <div className="mt-2 space-y-2 rounded-lg border border-amber-500/30 p-2">
      <p>{t('serverEditor.remoteSummary', { name: state.remote.project.name, time: formatDateRu(Date.parse(state.remote.updatedAt)), nodes: state.remote.project.canvas.nodes.length, models: state.remote.project.models.length })}</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary !py-1 text-xs" onClick={() => {
          if (window.confirm(t('serverEditor.keepMineConfirm'))) void session.keepMine();
        }}>{t('serverEditor.keepMine')}</button>
        <button className="btn-ghost !py-1 text-xs" onClick={() => {
          if (!window.confirm(t('serverEditor.acceptConfirm'))) return;
          const doc = session.acceptRemote();
          if (doc) { useExecutionStore.getState().reset(); useProjectStore.getState().replaceServerDocument(session, doc); }
        }}>{t('serverEditor.acceptRemote')}</button>
      </div>
    </div>}
  </section>;
}
