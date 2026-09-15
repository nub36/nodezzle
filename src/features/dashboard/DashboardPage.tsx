/**
 * Dashboard: проекты, последние изменения, создание нового проекта.
 * Типы проектов: Telegram-бот / Web / HTML / Telegram + Web / Пустой.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ProjectKind, ProjectSummary } from '@/core/project/schema';
import { useProjectStore } from '@/store/project-store';
import { formatDateRu } from '@/lib/utils';
import { TelegramBotPanel } from '@/features/telegram/TelegramBotPanel';
import { AuditLogSection } from '@/features/history/AuditLog';
import { ServerProjectsPanel } from '@/features/projects/ServerProjectsPanel';
import { OnboardingModal } from '@/features/academy/OnboardingModal';

const KIND_ICONS: Record<ProjectKind, string> = {
  telegram: '🤖',
  web: '🌐',
  'telegram-web': '🤖🌐',
  empty: '⬜',
};

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const section = searchParams.get('section');
  useEffect(() => {
    if (!section || !['account', 'telegram', 'history'].includes(section)) return;
    const target = document.getElementById(`dashboard-${section}`);
    target?.scrollIntoView({ block: 'start' });
    target?.focus({ preventScroll: true });
  }, [section]);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const sessionChanged = useCallback(() => setSessionEpoch((n) => n + 1), []);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [sandboxes, setSandboxes] = useState<ProjectSummary[]>([]);
  const [kind, setKind] = useState<ProjectKind>('telegram');
  const [creating, setCreating] = useState(false);
  const listProjects = useProjectStore((s) => s.listProjects);
  const createProject = useProjectStore((s) => s.createProject);
  const seedDemo = useProjectStore((s) => s.seedDemo);
  const deleteProject = useProjectStore((s) => s.deleteProject);

  const refresh = useCallback(async () => {
    const all = await listProjects();
    setProjects(all.filter((p) => p.tutorial === undefined));
    setSandboxes(all.filter((p) => p.tutorial !== undefined));
  }, [listProjects]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const project = await createProject(kind);
      navigate(`/projects/${project.id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleSeedDemo = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const project = await seedDemo();
      navigate(`/projects/${project.id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(t('dashboard.deleteConfirm', { name }))) return;
    await deleteProject(id);
    await refresh();
  };

  const handleSandboxResume = (p: ProjectSummary) => {
    if (p.tutorial === undefined) return;
    navigate(`/academy/lesson/${p.tutorial.lessonId}`);
  };

  const handleSandboxDelete = async (p: ProjectSummary) => {
    if (!window.confirm(t('academy.sandbox.deleteConfirm', { name: p.name }))) return;
    await deleteProject(p.id);
    await refresh();
  };

  const handleSandboxDetach = async (p: ProjectSummary) => {
    await useProjectStore.getState().detachSandbox(p.id);
    await refresh();
  };

  const kindOptions: ProjectKind[] = ['telegram', 'web', 'telegram-web', 'empty'];

  return (
    <div className="aurora noise min-h-screen">
      <OnboardingModal />
      <div className="aurora-blob aurora-blob--blue" />
      <div className="aurora-blob aurora-blob--purple" />



      <main className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-20 pt-6">
        <p className="workspace-eyebrow mb-3">{t('navigation.workspace')}</p>
        <h1 className="text-3xl font-bold tracking-tight">{t('dashboard.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('dashboard.subtitle')}</p>

        <nav className="dashboard-shortcuts" aria-label={t('navigation.quick')}>
          <Link to="/dashboard?section=account"><span>01</span><strong>{t('navigation.serverProjects')}</strong><small>{t('navigation.serverHint')}</small><b aria-hidden="true">↗</b></Link>
          <Link to="/academy"><span>02</span><strong>{t('navigation.goLearn')}</strong><small>{t('navigation.learnHint')}</small><b aria-hidden="true">↗</b></Link>
          <Link to="/workspace/requests"><span>03</span><strong>{t('navigation.links.requests')}</strong><small>{t('navigation.soon')}</small><b aria-hidden="true">↗</b></Link>
        </nav>
        {/* Создание проекта */}
        <div className="glass mt-6 flex flex-wrap items-end gap-4 rounded-2xl p-5">
          <div className="flex-1">
            <div className="mb-1.5 text-xs font-medium text-muted">{t('dashboard.newProject')}</div>
            <div className="flex flex-wrap gap-2">
              {kindOptions.map((k) => (
                <button
                  key={k}
                  data-testid={`project-kind-${k}`}
                  onClick={() => setKind(k)}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                    kind === k
                      ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.2)]'
                      : 'border-line bg-abyss/40 text-muted hover:border-cyan-400/30 hover:text-ink'
                  }`}
                >
                  {KIND_ICONS[k]} {t(`dashboard.kinds.${k}`)}
                </button>
              ))}
            </div>
          </div>
          <Link to="/build" className="btn-ghost" data-testid="create-simple-project">{t('simple.newProject')}</Link>
          <button className="btn-primary" data-testid="create-project" onClick={() => void handleCreate()} disabled={creating}>
            {creating ? '…' : '＋'} {t('dashboard.create')}
          </button>
        </div>

        {/* Проекты */}
        {projects.length === 0 ? (
          <div className="glass mt-8 rounded-3xl p-12 text-center">
            <div className="mb-3 text-4xl">🧩</div>
            <div className="text-lg font-bold">{t('dashboard.emptyTitle')}</div>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">{t('dashboard.emptyLead')}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                className="btn-ghost"
                onClick={() => {
                  setKind('empty');
                  void handleCreate();
                }}
                disabled={creating}
              >
                {t('dashboard.createEmpty')}
              </button>
              <button className="btn-primary" onClick={() => void handleSeedDemo()} disabled={creating}>
                🤖 {t('dashboard.loadDemo')}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <div key={p.id} className="glass card-hover flex flex-col rounded-2xl p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-2xl">{KIND_ICONS[p.kind]}</span>
                  <span className="status-chip !text-[10.5px]">{t(`dashboard.kinds.${p.kind}`)}</span>
                </div>
                <div className="mb-1 truncate text-sm font-bold" title={p.name}>
                  {p.name}
                </div>
                <div className="mb-4 text-xs text-muted">
                  {t('dashboard.modified')} {formatDateRu(p.updatedAt)}
                </div>
                <div className="mt-auto flex gap-2">
                  <Link to={`/build/${p.id}`} className="btn-ghost flex-1 justify-center !py-2 text-xs">{t('simple.mode')}</Link>
                  <Link to={`/projects/${p.id}`} className="btn-ghost flex-1 justify-center !py-2 text-xs">
                    {t('dashboard.open')}
                  </Link>
                  <button
                    className="btn-ghost !px-3 !py-2 text-xs hover:!border-red-400/40 hover:!text-red-300"
                    onClick={() => void handleDelete(p.id, p.name)}
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Учебные проекты Академии (песочницы уроков) */}
        {sandboxes.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-1 text-lg font-bold">🎓 {t('academy.sandbox.section')}</h2>
            <p className="mb-3 text-xs text-muted">{t('academy.sandbox.hint')}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sandboxes.map((p) => (
                <div key={p.id} className="glass flex flex-col rounded-2xl border border-violet-400/20 p-4">
                  <div className="mb-1 truncate text-sm font-bold" title={p.name}>
                    {p.name}
                  </div>
                  <div className="mb-3 text-xs text-muted">
                    {t('dashboard.modified')} {formatDateRu(p.updatedAt)}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <button className="btn-ghost flex-1 justify-center !py-2 text-xs" onClick={() => handleSandboxResume(p)}>
                      {t('academy.sandbox.resume')}
                    </button>
                    <button
                      className="btn-ghost !px-3 !py-2 text-xs hover:!border-cyan-400/40 hover:!text-cyan-200"
                      title={t('academy.sandbox.convert')}
                      onClick={() => void handleSandboxDetach(p)}
                    >
                      📁
                    </button>
                    <button
                      className="btn-ghost !px-3 !py-2 text-xs hover:!border-red-400/40 hover:!text-red-300"
                      title={t('academy.sandbox.delete')}
                      onClick={() => void handleSandboxDelete(p)}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div id="dashboard-account" tabIndex={-1}><ServerProjectsPanel localProjects={projects} onLocalChange={refresh} onSessionChange={sessionChanged} /></div>

        {/* Подключение Telegram-бота (токен — только через сервер) */}
        <div id="dashboard-telegram" tabIndex={-1}><TelegramBotPanel key={`bots-${sessionEpoch}`} /></div>

        {/* Журнал действий пространства (только чтение) */}
        <div id="dashboard-history" tabIndex={-1}><AuditLogSection key={`audit-${sessionEpoch}`} /></div>
      </main>
    </div>
  );
}
