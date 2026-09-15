import { useEffect, useState } from 'react';
import { Link, useParams, useBlocker } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CanvasPage } from '@/features/canvas/CanvasPage';
import { createProjectApi } from '@/lib/project-api';
import { createServerProjectApi } from '@/lib/server-project-api';
import { ServerSession, sameContent } from '@/core/project/server-session';
import { ServerDrafts, type DraftEntry } from '@/core/project/server-drafts';
import { useProjectStore } from '@/store/project-store';
import { copyErrorKey } from './ServerProjectsPanel';
import { newProjectCopy } from './project-copies';
import { projectStorage } from '@/core/project/storage';
import { formatDateRu } from '@/lib/utils';

export function ServerCanvasPage() {
  const { projectId = '' } = useParams();
  // Новый владелец жизненного цикла даже при переходе server → server.
  return <ServerCanvasLoader key={projectId} projectId={projectId} />;
}
function ServerCanvasLoader({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [session, setSession] = useState<ServerSession | null>(null);
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [fallback, setFallback] = useState<DraftEntry[]>([]);
  const [exported, setExported] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    let contextVersion = 0;
    const current = () => alive && contextVersion === 0;
    let opened: ServerSession | undefined;
    let channel: BroadcastChannel | undefined;
    const auth = createProjectApi();
    setError(''); setReady(false); setSession(null); setFallback([]); setExported('');
    let identifiedUser: string | undefined;
    const contextChanged = () => { ++contextVersion; opened?.pause('context'); setError('serverProjects.errors.auth'); setFallback([]); };
    const unload = (event: BeforeUnloadEvent) => {
      if (!opened) return;
      useProjectStore.getState().flushSave();
      if (opened.hasPending() || opened.getSnapshot().backupError) { event.preventDefault(); event.returnValue = ''; }
    };
    if (typeof BroadcastChannel !== 'undefined') { channel = new BroadcastChannel('nodezzle.account'); channel.onmessage = contextChanged; }
    window.addEventListener('focus', contextChanged);
    window.addEventListener('beforeunload', unload);
    void (async () => {
      try {
        const user = await auth.me(); identifiedUser = user.id;
        const remote = await createServerProjectApi().load(projectId);
        if ((await auth.me()).id !== user.id) throw new Error('SESSION_CHANGED');
        if (!current()) return;
        const backup = new ServerDrafts(localStorage);
        const candidates = backup.list(user.id, projectId, remote.workspaceId).filter((r) => !sameContent(r.draft.document, remote.project));
        opened = new ServerSession(user.id, remote, createServerProjectApi(), async () => (await auth.me()).id, backup);
        setSession(opened); setDrafts(candidates);
        if (candidates.length === 0) { useProjectStore.getState().openServer(opened); setReady(true); }

      } catch (err) {
        if (current()) {
          setError(copyErrorKey(err));
          if (identifiedUser) {
            try {
              const fresh = await auth.me();
              if (current() && fresh.id === identifiedUser) setFallback(new ServerDrafts(localStorage).list(identifiedUser, projectId));
            } catch { /* Без подтверждённого аккаунта резерв не раскрываем. */ }
          }
        }
      }
    })();
    return () => {
      alive = false; channel?.close();
      window.removeEventListener('focus', contextChanged); window.removeEventListener('beforeunload', unload);
      if (opened) {
        if (useProjectStore.getState().serverSession === opened) useProjectStore.getState().flushSave();
        useProjectStore.getState().closeServer(opened);
      }
    };
  }, [projectId, attempt]);
  const blocker = useBlocker(() => !!session && (session.hasPending() || session.getSnapshot().backupError));
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const warning = session?.getSnapshot().backupError ? 'serverEditor.leaveWithoutBackup' : 'serverEditor.leaveConfirm';
    if (window.confirm(t(warning))) blocker.proceed(); else blocker.reset();
  }, [blocker, session, t]);
  if (ready && session) return <CanvasPage serverSession={session} />;
  return <main className="aurora min-h-screen p-6"><section className="glass mx-auto max-w-2xl space-y-4 rounded-2xl p-6">
    <h1 className="text-xl font-bold">{t('serverEditor.title')}</h1>
    <Link className="btn-ghost" to="/dashboard">{t('serverEditor.dashboard')}</Link>
    {error ? <><p role="alert">{t(error)}</p><button className="btn-primary" onClick={() => setAttempt((n) => n + 1)}>{t('serverEditor.retryOpen')}</button>
      {fallback.length > 0 && <div className="space-y-2"><p>{t('serverEditor.fallback')}</p>{fallback.map((entry) => <button key={entry.key} className="btn-ghost block" onClick={() => {
        void (async () => {
          try { const value = newProjectCopy(entry.draft.document); if (await projectStorage.get(value.id)) throw new Error('COLLISION'); await projectStorage.save(value); setExported(value.id); }
          catch { setError('serverEditor.copyFailed'); }
        })();
      }}>{t('serverEditor.copyLocal')} · {entry.draft.document.name}</button>)}</div>}
      {exported && <Link className="btn-primary" to={`/projects/${exported}`}>{t('serverProjects.openLocal')}</Link>}
    </> : !session ? <p>{t('common.loading')}</p> : <>
      <h2>{t('serverEditor.drafts')}</h2><p className="text-sm text-muted">{t('serverEditor.draftInfo')}</p>
      <ul className="space-y-3">{drafts.map((entry) => <li key={entry.key} className="rounded-lg border border-line p-3">
        <p className="break-all text-sm">{entry.draft.document.name} · {formatDateRu(entry.draft.updatedAt)}</p>
        <button data-testid="recover-server-draft" className="btn-primary !py-2 text-xs" onClick={() => {
          session.recover(entry.draft); useProjectStore.getState().openServer(session); setReady(true);
        }}>{t('serverEditor.recover')}</button>
        <button className="btn-ghost !py-2 text-xs" onClick={() => {
          if (!window.confirm(t('serverEditor.deleteDraftConfirm'))) return;
          try { new ServerDrafts(localStorage).remove(entry.key); setDrafts((list) => list.filter((d) => d.key !== entry.key)); }
          catch { setError('serverEditor.backupError'); }
        }}>{t('serverEditor.deleteDraft')}</button>
      </li>)}</ul>
      <button className="btn-ghost" onClick={() => { useProjectStore.getState().openServer(session); setReady(true); }}>{t('serverEditor.openRemote')}</button>
    </>}
  </section></main>;
}
