import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { projectStorage } from '@/core/project/storage';
import type { ProjectSummary } from '@/core/project/schema';
import { createProjectApi, type AccountUser, type ServerProjectSummary } from '@/lib/project-api';
import { ApiClientError } from '@/lib/server-api';
import { formatDateRu } from '@/lib/utils';
import { ProjectCopyError, restoreProjectCopy, uploadProjectCopy } from './project-copies';

export function copyErrorKey(error: unknown): string {
  if (error instanceof ProjectCopyError) return `serverProjects.errors.${error.code}`;
  if (error instanceof ApiClientError) {
    if (error.code === 'INVALID_RESPONSE') return 'serverProjects.errors.INVALID_RESPONSE';
    const keys: Record<number, string> = { 400: 'invalid', 401: 'auth', 403: 'forbidden', 404: 'missing', 409: 'conflict', 413: 'large', 429: 'limit' };
    if (keys[error.status]) return `serverProjects.errors.${keys[error.status]}`;
  }
  return 'serverProjects.errors.network';
}

type Props = { localProjects: ProjectSummary[]; onLocalChange(): Promise<void>; onSessionChange(): void };
export function ServerProjectsPanel({ localProjects, onLocalChange, onSessionChange }: Props) {
  const { t } = useTranslation();
  const [api] = useState(() => createProjectApi());
  const [user, setUser] = useState<AccountUser | null>(null);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [projects, setProjects] = useState<ServerProjectSummary[]>([]);
  const [listed, setListed] = useState(false);
  const [localId, setLocalId] = useState('');
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [restoredId, setRestoredId] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const sequence = useRef(0);
  const running = useRef(false);
  const alive = useRef(false);
  const accountId = useRef<string | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const clearAccount = useCallback(() => {
    if (accountId.current !== null) onSessionChange();
    accountId.current = null;
    setRegister(false); setEmail(''); setPassword(''); setName('');
    setUser(null); setWorkspaces([]); setWorkspaceId(''); setProjects([]); setListed(false);
    setUncertain(false); setRestoredId('');
  }, [onSessionChange]);

  const run = useCallback(async (task: (current: () => boolean) => Promise<void>, interrupt = false) => {
    if (running.current && !interrupt) return;
    const ticket = ++sequence.current;
    const current = () => alive.current && ticket === sequence.current;
    running.current = true; setBusy(true); setError(''); setNotice(''); setRestoredId('');
    try { await task(current); }
    catch (err) {
      if (!current()) return;
      if (err instanceof ApiClientError && err.status === 401) clearAccount();
      setError(copyErrorKey(err));
    } finally {
      if (current()) { running.current = false; setBusy(false); }
    }
  }, [clearAccount]);

  const loadAccount = useCallback(async (current: () => boolean) => {
    let next: AccountUser;
    try { next = await api.me(); }
    catch (err) {
      if (current()) clearAccount();
      if (err instanceof ApiClientError && err.status === 401) return;
      throw err;
    }
    if (!current()) return;
    const changed = accountId.current !== next.id;
    if (changed) { clearAccount(); onSessionChange(); }
    accountId.current = next.id; setUser(next);
    const spaces = await api.workspaces();
    if (!current()) return;
    setWorkspaces(spaces);
    // Даже единственное пространство выбирается явно, а не «первое» автоматически.
    setWorkspaceId(''); setProjects([]); setListed(false); setUncertain(false);
  }, [api, clearAccount, onSessionChange]);

  useEffect(() => {
    alive.current = true;
    const check = () => { void run(loadAccount, true); };
    check();
    window.addEventListener('focus', check);
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel('nodezzle.account');
      channel.current.onmessage = check;
    }
    return () => {
      alive.current = false; ++sequence.current; running.current = false;
      window.removeEventListener('focus', check);
      channel.current?.close(); channel.current = null;
    };
  }, [loadAccount, run]);

  const authenticate = (event: FormEvent) => {
    event.preventDefault();
    const submittedPassword = password;
    setPassword('');
    void run(async (current) => {
      try {
        if (register) await api.register(email, submittedPassword, name.trim());
        else await api.login(email, submittedPassword);
      } finally { channel.current?.postMessage('changed'); }
      if (current()) await loadAccount(current);
    });
  };
  const refreshList = (space: string) => void run(async (current) => {
    const rows = await api.list(space);
    if (current()) { setProjects(rows); setListed(true); setUncertain(false); }
  });
  const upload = () => void run(async (current) => {
    try {
      const copy = await uploadProjectCopy(api, projectStorage, workspaceId, localId, current);
      if (!current()) return;
      setNotice('serverProjects.uploaded'); setUncertain(false);
      // POST подтверждён. Не превращаем ошибку последующего GET в ложный «не сохранено».
      setProjects((rows) => [{ id: copy.id, name: copy.name, kind: copy.kind, updatedAt: new Date(copy.meta.updatedAt).toISOString() }, ...rows]);
    } catch (err) {
      if (current() && !(err instanceof ProjectCopyError)) setUncertain(true);
      throw err;
    }
  });
  const restore = (id: string) => void run(async (current) => {
    const copy = await restoreProjectCopy(api, projectStorage, id, current);
    if (!current()) return;
    setNotice('serverProjects.restored'); setRestoredId(copy.id);
    await onLocalChange();
  });
  const inputClass = 'mt-1 w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 disabled:opacity-50';
  return (
    <section aria-labelledby="server-projects-title" className="glass rounded-2xl mt-10 space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="server-projects-title" className="text-lg font-bold">{t('serverProjects.title')}</h2>
        <button className="btn-ghost !py-1.5 text-xs" disabled={busy} onClick={() => void run(loadAccount)}>{t('serverProjects.checkAccount')}</button>
      </div>
      <p className="text-sm text-slate-300">{t('serverProjects.description')}</p>
      <p className="text-xs text-slate-400">{t('serverProjects.localWarning')}</p>
      {busy && <p role="status" className="text-xs text-cyan-300">{t('serverProjects.busy')}</p>}
      {error && <p role="alert" className="text-sm text-red-300">{t(error)}</p>}
      {uncertain && <p role="alert" className="text-sm text-amber-200">{t('serverProjects.uncertain')}</p>}
      {notice && <p role="status" className="text-sm text-emerald-300">{t(notice)} {restoredId && <Link className="underline" to={`/projects/${restoredId}`}>{t('serverProjects.openLocal')}</Link>}</p>}
      {!user ? (
        <form onSubmit={authenticate} className="space-y-3">
          <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
            {register && <label className="text-xs text-slate-300">{t('serverProjects.name')}<input className={inputClass} required maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>}
            <label className="text-xs text-slate-300">{t('serverProjects.email')}<input className={inputClass} required type="email" maxLength={254} autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="text-xs text-slate-300">{t('serverProjects.password')}<input className={inputClass} required type="password" minLength={8} maxLength={256} autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <div className="flex flex-wrap items-end gap-2">
              <button type="submit" className="btn-primary !py-2 text-sm">{t(register ? 'serverProjects.register' : 'serverProjects.login')}</button>
              <button type="button" className="btn-ghost !py-2 text-xs" onClick={() => { setRegister(!register); setPassword(''); setError(''); }}>{t(register ? 'serverProjects.toLogin' : 'serverProjects.toRegister')}</button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="break-all">{user.name} · {user.email}</span>
            <button disabled={busy} className="btn-ghost !py-1.5 text-xs" onClick={() => void run(async (current) => {
              try { await api.logout(); } finally { channel.current?.postMessage('changed'); }
              if (current()) clearAccount();
            })}>{t('serverProjects.logout')}</button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 text-xs text-slate-300">{t('serverProjects.workspace')}
              <select className={inputClass} disabled={busy} value={workspaceId} onChange={(e) => {
                const space = e.target.value;
                setWorkspaceId(space); setProjects([]); setListed(false); setUncertain(false); setNotice(''); setRestoredId('');
                if (space) refreshList(space);
              }}>
                <option value="">{t('serverProjects.chooseWorkspace')}</option>
                {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <button disabled={busy || !workspaceId} className="btn-ghost !py-2 text-xs" onClick={() => refreshList(workspaceId)}>{t('serverProjects.refresh')}</button>
          </div>
          {workspaces.length === 0 && !busy && <p className="text-xs text-slate-400">{t('serverProjects.noWorkspaces')}</p>}
          {workspaceId && <>
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-0 flex-1 text-xs text-slate-300">{t('serverProjects.localProject')}
                <select className={inputClass} value={localId} disabled={busy} onChange={(e) => setLocalId(e.target.value)}>
                  <option value="">{t('serverProjects.chooseLocal')}</option>
                  {localProjects.filter((p) => !p.tutorial).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.id.slice(0, 8)}</option>)}
                </select>
              </label>
              <button disabled={busy || !listed || uncertain || !localProjects.some((p) => p.id === localId && !p.tutorial)} className="btn-primary !py-2 text-sm" onClick={upload}>{t('serverProjects.upload')}</button>
            </div>
            <p className="text-xs text-slate-400">{t('serverProjects.tutorialWarning')}</p>
            {listed && projects.length === 0 && <p className="text-sm text-slate-400">{t('serverProjects.empty')}</p>}
            <ul className="space-y-2">
              {projects.map((p) => <li key={p.id} data-testid="server-project" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3">
                <div className="min-w-0"><p className="break-all text-sm font-semibold">{p.name}</p><p className="text-xs text-slate-400">{t(`dashboard.kinds.${p.kind}`)} · {p.id.slice(0, 8)} · {formatDateRu(Date.parse(p.updatedAt))}</p></div>
                <button disabled={busy} className="btn-ghost !py-2 text-xs" onClick={() => restore(p.id)}>{t('serverProjects.restore')}</button>
              </li>)}
            </ul>
          </>}
        </>
      )}
      <details className="text-xs text-slate-400"><summary className="cursor-pointer text-slate-300">{t('serverProjects.helpTitle')}</summary><ol className="mt-2 list-inside list-decimal space-y-2">{[1, 2, 3, 4].map((n) => <li key={n}>{t(`serverProjects.help${n}`)}</li>)}</ol></details>
    </section>
  );
}
