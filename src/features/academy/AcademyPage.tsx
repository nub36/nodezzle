/**
 * Академия NODEZZLE — страница уровней и уроков (подэтап 5.11).
 * Уроки и их порядок берутся из каталога (`src/academy/catalog.ts`),
 * состояние — из стора прогресса.
 */

import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { lessons } from '@/academy/catalog';
import { isLessonAvailable, lessonPercent, levelPercent, nextLesson, totalPercent } from '@/academy/progress';
import type { LessonDefinition } from '@/academy/types';
import { useAcademyStore } from '@/store/academy-store';
import { cn } from '@/lib/utils';

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function LessonCard({ lesson }: { lesson: LessonDefinition }) {
  const { t } = useTranslation();
  const progress = useAcademyStore((s) => s.progress);
  const state = progress.lessons[lesson.id];
  const available = isLessonAvailable(progress, lessons, lesson.id);
  const percent = lessonPercent(progress, lesson);
  const isNext = nextLesson(progress, lessons)?.id === lesson.id;

  return (
    <Link
      to={available ? `/academy/lesson/${lesson.id}` : '#'}
      aria-disabled={!available}
      className={cn(
        'glass block rounded-2xl p-4 transition-all',
        available ? 'hover:border-cyan-400/40 hover:shadow-[0_0_24px_rgba(34,211,238,0.12)]' : 'opacity-50',
        isNext && 'border-cyan-400/50 shadow-[0_0_28px_rgba(34,211,238,0.16)]',
      )}
    >
      <div className="mb-1 flex items-center gap-2">
        <span aria-hidden>
          {state?.status === 'completed' ? '✅' : !available ? '🔒' : isNext ? '🎯' : state?.status === 'in-progress' ? '🧩' : '·'}
        </span>
        <span className="truncate text-sm font-bold">{t(lesson.titleKey)}</span>
      </div>
      <div className="mb-3 line-clamp-2 text-xs text-muted">{t(lesson.descriptionKey)}</div>
      <div className="mb-2 h-1 overflow-hidden rounded bg-line/60">
        <div className="h-full bg-gradient-to-r from-cyan-400 to-violet-400" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted/80">
        <span>⏱ {t('academy.minutes', { count: lesson.estimatedMinutes })}</span>
        <span>· {t(`academy.difficulty.${lesson.difficulty}`)}</span>
        <span className="ml-auto">
          {state?.status === 'completed'
            ? t('academy.done')
            : !available
              ? t('academy.locked')
              : state?.status === 'in-progress'
                ? `${t('academy.inProgress')} · ${percent}%`
                : t('academy.available')}
        </span>
      </div>
    </Link>
  );
}

export function AcademyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const progress = useAcademyStore((s) => s.progress);
  const total = totalPercent(progress, lessons);
  const next = nextLesson(progress, lessons);

  return (
    <div className="aurora min-h-screen bg-abyss text-ink">
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-2">
            <button className="btn-ghost !py-1.5 text-xs" onClick={() => navigate('/dashboard')}>
              ← {t('academy.backToDashboard')}
            </button>
            <Link to="/academy/reference" className="btn-ghost !py-1.5 text-xs">
              📚 {t('academy.reference.open')}
            </Link>
          </div>
          <h1 className="text-gradient mb-1 text-3xl font-black tracking-tight">{t('academy.title')}</h1>
          <p className="mb-4 text-sm text-muted">{t('academy.subtitle')}</p>
          <div className="glass flex items-center gap-4 rounded-2xl px-4 py-3">
            <div className="h-2 flex-1 overflow-hidden rounded bg-line/60">
              <div className="h-full bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400" style={{ width: `${total}%` }} />
            </div>
            <span className="whitespace-nowrap text-xs text-muted">
              {t('academy.totalProgress')}: {total}% ·{' '}
              {t('academy.completedOf', {
                done: lessons.filter((l) => progress.lessons[l.id]?.status === 'completed').length,
                total: lessons.length,
              })}
            </span>
            {next !== null && (
              <Link to={`/academy/lesson/${next.id}`} className="btn-primary whitespace-nowrap !py-1.5 text-xs">
                {t('academy.continue')} →
              </Link>
            )}
          </div>
        </div>

        {lessons.length === 0 && (
          <div className="glass rounded-2xl p-8 text-center text-sm text-muted">{t('academy.emptyCatalog')}</div>
        )}

        <div className="space-y-8">
          {LEVELS.map((level) => {
            const levelLessons = lessons.filter((l) => l.level === level);
            if (levelLessons.length === 0) return null;
            return (
              <section key={level}>
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-muted">
                    {t(`academy.levels.${level}`)}
                  </h2>
                  <span className="text-[10px] text-muted/70">{levelPercent(progress, lessons, level)}%</span>
                  <div className="h-px flex-1 bg-line/60" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {levelLessons.map((lesson) => (
                    <LessonCard key={lesson.id} lesson={lesson} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
