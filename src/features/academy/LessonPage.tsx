/**
 * Страница урока: описание, шаги, запуск в учебном проекте, сброс.
 */

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getLesson } from '@/academy/catalog';
import type { LessonStep } from '@/academy/types';
import { useAcademyStore } from '@/store/academy-store';
import { useProjectStore } from '@/store/project-store';
import { openLessonSandbox, lessonCanvasPath } from './session';

const STEP_ICONS: Record<LessonStep['kind'], string> = {
  information: '📖',
  'open-page': '🚪',
  'add-block': '🧩',
  connect: '🔗',
  configure: '🛠',
  run: '▶',
  'send-simulator-message': '💬',
  'select-block': '👆',
  'create-model': '📦',
  'open-debug': '🔍',
  'publish-preview': '🚀',
  quiz: '❓',
};

export function LessonPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lessonId } = useParams<{ lessonId: string }>();
  const progress = useAcademyStore((s) => s.progress);
  const begin = useAcademyStore((s) => s.begin);
  const reset = useAcademyStore((s) => s.reset);
  const [busy, setBusy] = useState(false);

  const lesson = lessonId !== undefined ? getLesson(lessonId) : undefined;
  if (lesson === undefined) {
    return (
      <div className="aurora flex min-h-screen items-center justify-center bg-abyss text-ink">
        <div className="glass rounded-2xl p-8 text-center">
          <p className="mb-4 text-sm text-muted">{t('academy.notFound')}</p>
          <Link to="/academy" className="btn-primary !py-1.5 text-xs">
            ← {t('academy.lesson.back')}
          </Link>
        </div>
      </div>
    );
  }

  const state = progress.lessons[lesson.id];
  const started = state !== undefined && state.status !== 'not-started';
  const stepIndex = state?.stepIndex ?? 0;

  const handleStart = async () => {
    setBusy(true);
    try {
      begin(lesson.id);
      if (!lesson.sandbox) {
        // Уроки без песочницы идут прямо здесь, без учебного проекта.
        navigate(`/academy?lesson=${encodeURIComponent(lesson.id)}`);
        return;
      }
      const projectId = await openLessonSandbox(lesson);
      navigate(lessonCanvasPath(projectId, lesson.id));
    } finally {
      setBusy(false);
    }
  };

  const handleRestart = async () => {
    if (!window.confirm(t('academy.lesson.restartConfirm'))) return;
    setBusy(true);
    try {
      reset(lesson.id);
      if (!lesson.sandbox) {
        navigate(`/academy?lesson=${encodeURIComponent(lesson.id)}`);
        return;
      }
      const projectId = await openLessonSandbox(lesson);
      // Очистить учебную схему (и сразу сохранить), чтобы перезапуск
      // холста не поднял старое состояние из хранилища.
      const projectStore = useProjectStore.getState();
      await projectStore.loadById(projectId);
      projectStore.resetSandboxCanvas();
      await projectStore.saveNow();
      navigate(lessonCanvasPath(projectId, lesson.id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="aurora min-h-screen bg-abyss text-ink">
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link to="/academy" className="btn-ghost mb-6 inline-block !py-1.5 text-xs">
          ← {t('academy.lesson.back')}
        </Link>

        <div className="glass mb-6 rounded-2xl p-6">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span className="rounded-full border border-line px-2 py-0.5">{t(`academy.levels.${lesson.level}`)}</span>
            <span className="rounded-full border border-line px-2 py-0.5">⏱ {t('academy.minutes', { count: lesson.estimatedMinutes })}</span>
            <span className="rounded-full border border-line px-2 py-0.5">{t(`academy.difficulty.${lesson.difficulty}`)}</span>
            {state?.status === 'completed' && <span className="text-emerald-300">✅ {t('academy.done')}</span>}
          </div>
          <h1 className="text-gradient mb-2 text-2xl font-black tracking-tight">{t(lesson.titleKey)}</h1>
          <p className="text-sm text-muted">{t(lesson.descriptionKey)}</p>
          {lesson.plannedNoteKey !== undefined && (
            <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
              {t('academy.lesson.plannedNoteTitle')}: {t(lesson.plannedNoteKey)}
            </p>
          )}
        </div>

        <section className="glass mb-6 rounded-2xl p-6">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted">{t('academy.lesson.steps')}</h2>
          <ol className="space-y-2">
            {lesson.steps.map((step, index) => {
              const isCurrent = index === stepIndex && state?.status === 'in-progress';
              const isDone = state?.status === 'completed' || index < stepIndex;
              return (
                <li
                  key={step.id}
                  className={
                    'flex items-start gap-3 rounded-xl border px-3 py-2 text-sm ' +
                    (isDone
                      ? 'border-emerald-400/20 text-muted'
                      : isCurrent
                        ? 'border-cyan-400/40 bg-cyan-400/5'
                        : 'border-line/60')
                  }
                >
                  <span aria-hidden className="mt-0.5">{isDone ? '✅' : STEP_ICONS[step.kind]}</span>
                  <div className="min-w-0">
                    <div className="font-medium">{t(step.titleKey)}</div>
                    <div className="text-xs text-muted">
                      {t(`academy.stepKinds.${step.kind}`)}
                      {isCurrent ? ` · ${t('academy.inProgress')}` : ''}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {lesson.relatedBlockIds !== undefined && lesson.relatedBlockIds.length > 0 && (
          <section className="glass mb-6 rounded-2xl p-6">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">
              {t('academy.lesson.relatedBlocks')}
            </h2>
            <div className="flex flex-wrap gap-2">
              {lesson.relatedBlockIds.map((blockId) => (
                <Link
                  key={blockId}
                  to={`/academy/reference?block=${encodeURIComponent(blockId)}`}
                  className="rounded-lg border border-line px-2.5 py-1 font-mono text-xs text-muted transition-colors hover:border-cyan-400/40 hover:text-ink"
                >
                  {blockId}
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary text-sm" disabled={busy} onClick={() => void handleStart()}>
            {started && state?.status !== 'completed' ? t('academy.lesson.continueLesson') : t('academy.lesson.start')}
          </button>
          {started && (
            <button className="btn-ghost text-xs" disabled={busy} onClick={() => void handleRestart()}>
              {t('academy.lesson.restart')}
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-muted/70">{t('academy.lesson.sandboxHint')}</p>
      </main>
    </div>
  );
}
