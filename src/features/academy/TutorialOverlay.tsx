/**
 * Пошаговые подсказки поверх реального интерфейса (подэтап 5.11).
 *
 * Подсвечивает цель шага (элемент с `data-tutorial`), показывает карточку
 * шага с текстом, подсказкой и действиями (викторина, «Понятно»).
 * Интерфейс не блокируется: затемнение рисуется тенью вокруг цели.
 * Учитывает prefers-reduced-motion и клавиатуру (Esc — прервать урок).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { lessons } from '@/academy/catalog';
import { describeEvent } from '@/academy/events';
import { nextLesson } from '@/academy/progress';
import type { LessonStep } from '@/academy/types';
import { useAcademyStore } from '@/store/academy-store';
import { useTutorialStore } from '@/store/tutorial-store';

import { useFloatingLesson } from './useFloatingLesson';
import { useProjectStore } from '@/store/project-store';
import { blockRegistry } from '@/core/registry/block-registry';

import { LessonStepContent } from './LessonStepContent';

const AUTO_HINT_MS = 25_000;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function measureTarget(target: string | undefined): Rect | null {
  if (target === undefined || target === 'none') return null;
  const panelTarget = ['debug', 'simulator', 'chat', 'history'].includes(target);
  // Цель урока — область, а DOM-маркеры вкладок имеют префикс tab-.
  // Если панель закрыта, сначала показываем кнопку её открытия.
  const marker = ['simulator', 'chat', 'history'].includes(target) ? `tab-${target}` : target;
  const el = document.querySelector(`[data-tutorial="${marker}"]`)
    ?? (panelTarget ? document.querySelector('[data-tutorial="debug-toggle"]') : null);
  if (el === null) return null;
  const box = el.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) {
    const toggle = document.querySelector(`[data-tutorial="panel-toggle-${target}"]`);
    const button = toggle?.getBoundingClientRect();
    return button ? { top: button.top, left: button.left, width: button.width, height: button.height } : null;
  }
  return { top: box.top, left: box.left, width: box.width, height: box.height };
}

export function TutorialOverlay() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const lesson = useTutorialStore((s) => s.lesson);
  const stepIndex = useTutorialStore((s) => s.stepIndex);
  const active = useTutorialStore((s) => s.active);
  const finished = useTutorialStore((s) => s.finished);
  const hintVisible = useTutorialStore((s) => s.hintVisible);
  const showHint = useTutorialStore((s) => s.showHint);
  const acknowledge = useTutorialStore((s) => s.acknowledge);
  const answerQuiz = useTutorialStore((s) => s.answerQuiz);
  const exit = useTutorialStore((s) => s.exit);
  const stop = useTutorialStore((s) => s.stop);
  const recheck = useTutorialStore((s) => s.recheck);
  const lastEvent = useTutorialStore((s) => s.lastEvent);
  const progress = useAcademyStore((s) => s.progress);
  const [searchParams] = useSearchParams();
  const academyDebug = searchParams.get('academyDebug') === '1';

  // «Следующий урок» на экране завершения.
  const next = nextLesson(progress, lessons);
  const nextLessonId = lesson !== null && next !== null && next.id !== lesson.id ? next.id : null;

  const step: LessonStep | null = lesson !== null ? (lesson.steps[stepIndex] ?? null) : null;
  const [rect, setRect] = useState<Rect | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const floating = useFloatingLesson(`${lesson?.id}:${active}:${finished}`);
  const connecting = useProjectStore((s) => s.dragPort !== null);
  const [checkedStep, setCheckedStep] = useState<string | null>(null);
  const [wrongAnswer, setWrongAnswer] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Подсветка цели: измеряем периодически (панели открываются/закрываются).
  const target = step?.target;
  useEffect(() => {
    if (!active || step === null) {
      setRect(null);
      return;
    }
    const measure = () => setRect(measureTarget(target));
    measure();
    const timer = setInterval(measure, 500);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', measure);
    };
  }, [active, step, target, stepIndex]);

  // Автоподсказка, если пользователь долго не справляется.
  useEffect(() => {
    if (!active || step === null || step.hintKey === undefined) return;
    hintTimer.current = setTimeout(() => showHint(), AUTO_HINT_MS);
    return () => {
      if (hintTimer.current !== null) clearTimeout(hintTimer.current);
    };
  }, [active, step, stepIndex, showHint]);

  // Esc — прервать урок (с подтверждением).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.defaultPrevented && e.key === 'Escape' && window.confirm(t('academy.overlay.exitConfirm'))) {
        stop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, stop, t]);

  const handleQuiz = useCallback(
    (optionId: string) => {
      const before = useTutorialStore.getState().stepIndex;
      answerQuiz(optionId);
      const after = useTutorialStore.getState().stepIndex;
      setWrongAnswer(after === before);
    },
    [answerQuiz],
  );

  useEffect(() => {
    setWrongAnswer(false);
    setCheckedStep(null);
    setCollapsed(false);
  }, [stepIndex, lesson?.id]);

  if (lesson === null) return null;

  // Карточка «Урок завершён».
  if (finished) {
    return (
      <div ref={floating.ref} style={floating.style} className="fixed right-4 top-16 z-[70] w-[304px] max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain" role="dialog" aria-label={t('academy.overlay.finishedTitle')} data-testid="tutorial-finished">
        <div className="glass-strong tutorial-anim rounded-xl border border-emerald-400/40 p-3 shadow-[0_0_40px_rgba(52,211,153,0.2)]">
          <div className="mb-2 flex gap-2">
            <button {...floating.handle} data-testid="tutorial-drag" className="min-w-0 flex-1 cursor-move touch-none select-none text-left text-xs text-muted" title={t('academy.overlay.moveHint')} aria-label={t('academy.overlay.move')}>⠿ {t('academy.overlay.finishedTitle')}</button>
            <button onClick={floating.reset} title={t('academy.overlay.resetPosition')} aria-label={t('academy.overlay.resetPosition')}>↺</button>
          </div>
          <div className="mb-2 text-2xl">🎉</div>
          <div className="mb-1 text-sm font-bold">{t('academy.overlay.finishedTitle')}</div>
          <p className="mb-4 text-xs text-muted">{t('academy.overlay.finishedText', { title: t(lesson.titleKey) })}</p>
          <div className="flex flex-col gap-2">
            {nextLessonId !== null && (
              <button
                data-testid="tutorial-next-lesson"
                className="btn-primary justify-center !py-1.5 text-xs"
                onClick={() => navigate(`/academy/lesson/${nextLessonId}`)}
              >
                {t('academy.overlay.nextLesson')} →
              </button>
            )}
            <div className="flex gap-2">
              <button
                data-testid="tutorial-to-academy"
                className="btn-ghost flex-1 justify-center !py-1.5 text-xs"
                onClick={() => navigate('/academy')}
              >
                {t('academy.overlay.toAcademy')}
              </button>
              <button data-testid="tutorial-stay" className="btn-ghost !py-1.5 text-xs" onClick={exit}>
                {t('academy.overlay.stay')}
              </button>
              <button
                data-testid="tutorial-restart"
                className="btn-ghost !py-1.5 text-xs"
                onClick={() => navigate(`/academy/lesson/${lesson.id}`)}
              >
                ↺
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!active || step === null) return null;

  const needsAcknowledge = step.kind === 'information' || step.kind === 'publish-preview';

  return (
    <>
      {/* Затемнение вокруг цели (интерфейс остаётся кликабельным). */}
      {rect !== null && (
        <div
          aria-hidden
          data-testid="tutorial-highlight"
          className="tutorial-anim pointer-events-none fixed z-[60] rounded-xl border-2 border-cyan-400/80"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(3, 6, 15, 0.35), 0 0 24px rgba(34, 211, 238, 0.35)',
          }}
        />
      )}

      {/* При протягивании провода карточка не перехватывает отпускание над портом. */}
      <div
        ref={floating.ref}
        style={{ ...floating.style, pointerEvents: connecting ? 'none' : undefined }}
        className={`tutorial-step-window fixed top-16 z-[70] w-[304px] max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain ${target === 'inspector' ? 'left-4 sm:left-[304px]' : 'right-4'}`}
        role="dialog"
        aria-label={t('academy.overlay.stepOf', { index: stepIndex + 1, total: lesson.steps.length })}
        data-testid="tutorial-card"
        data-step-id={step.id}
        data-step-kind={step.kind}
      >
        <div className="glass-strong tutorial-anim rounded-xl border border-cyan-400/30 p-3 shadow-[0_0_32px_rgba(34,211,238,0.15)]">
          <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted">
            <button {...floating.handle} data-testid="tutorial-drag"
              className="min-w-0 flex-1 cursor-move touch-none select-none truncate text-left"
              title={t('academy.overlay.moveHint')} aria-label={t('academy.overlay.move')}>⠿ {t(lesson.titleKey)}</button>
            <button className="shrink-0 rounded px-1 py-1 hover:bg-cyan-400/10" onClick={floating.reset}
              data-testid="tutorial-reset-position" title={t('academy.overlay.resetPosition')} aria-label={t('academy.overlay.resetPosition')}>↺</button>
            <span className="shrink-0" data-testid="tutorial-step-index">
              {t('academy.overlay.stepOf', { index: stepIndex + 1, total: lesson.steps.length })}
            </span>
            <button className="shrink-0 rounded px-1.5 py-1 text-sm hover:bg-cyan-400/10"
              data-testid="tutorial-collapse" aria-expanded={!collapsed} aria-controls="tutorial-step-body"
              aria-label={t(collapsed ? 'academy.overlay.expand' : 'academy.overlay.collapse')}
              title={t(collapsed ? 'academy.overlay.expand' : 'academy.overlay.collapse')}
              onClick={() => setCollapsed((value) => !value)}>
              {collapsed ? '+' : '−'}
            </button>
          </div>
          <div className="mb-1 h-1 overflow-hidden rounded bg-line/60">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-all"
              style={{ width: `${((stepIndex + 1) / lesson.steps.length) * 100}%` }}
            />
          </div>

          <div className="mb-1 mt-2 text-sm font-bold" aria-live="polite">{t(step.titleKey)}</div>
          <div id="tutorial-step-body" hidden={collapsed}>
            <LessonStepContent step={step} />

            {step.kind === 'quiz' && (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-medium">{t(step.questionKey)}</p>
                {step.options.map((option) => (
                  <button
                    key={option.id}
                    data-testid={`tutorial-quiz-${option.id}`}
                    className="btn-ghost w-full justify-start !py-1.5 text-left text-xs"
                    onClick={() => handleQuiz(option.id)}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
                {wrongAnswer && <p className="text-xs text-red-300" data-testid="tutorial-quiz-wrong">{t('academy.overlay.wrong')}</p>}
              </div>
            )}

            {needsAcknowledge && (
              <button
                data-testid="tutorial-ack"
                className="btn-primary mt-3 w-full justify-center !py-1.5 text-xs"
                onClick={acknowledge}
              >
                {t('academy.overlay.ack')}
              </button>
            )}

            {!needsAcknowledge && step.kind !== 'quiz' && (
              <p className="mt-3 text-[10px] text-muted/70">{t('academy.overlay.autoCheck')}</p>
            )}

            {step.hintKey !== undefined && (
              <div className="mt-2">
                {!hintVisible ? (
                  <button className="text-[11px] text-cyan-300 underline-offset-2 hover:underline" onClick={showHint}>
                    💡 {t('academy.overlay.hint')}
                  </button>
                ) : (
                  <p className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-2.5 py-1.5 text-[11px] text-cyan-100">
                    💡 {t(step.hintKey)}
                  </p>
                )}
              </div>
            )}

            {checkedStep === step.id && (
              <p role="status" data-testid="tutorial-check-result" className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/5 p-2 text-[11px] text-amber-100">
                {step.kind === 'connect' ? t('academy.overlay.checkConnection', {
                  from: t(blockRegistry.get(step.fromBlockId)?.labelKey ?? step.fromBlockId),
                  output: t(blockRegistry.get(step.fromBlockId)?.outputs.find((p) => p.id === step.fromPortId)?.labelKey ?? step.fromPortId ?? 'academy.overlay.anyOutput'),
                  to: t(blockRegistry.get(step.toBlockId)?.labelKey ?? step.toBlockId),
                  input: t(blockRegistry.get(step.toBlockId)?.inputs.find((p) => p.id === step.toPortId)?.labelKey ?? step.toPortId ?? 'academy.overlay.anyInput'),
                }) : t('academy.overlay.checkPending')}
              </p>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              {!needsAcknowledge && step.kind !== 'quiz' ? (
                <button
                  data-testid="tutorial-recheck"
                  className="text-[10px] text-cyan-300/80 underline-offset-2 hover:underline"
                  title={t('academy.overlay.recheckHint')}
                  onClick={() => { setCheckedStep(step.id); recheck(); }}
                >
                  ✓ {t('academy.overlay.recheck')}
                </button>
              ) : (
                <span />
              )}
              <button
                className="text-[10px] text-muted/60 hover:text-muted"
                data-testid="tutorial-exit"
                onClick={() => {
                  if (window.confirm(t('academy.overlay.exitConfirm'))) stop();
                }}
              >
                {t('academy.overlay.exit')}
              </button>
            </div>
          </div>

          {academyDebug && (
            <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/5 px-2 py-1.5 font-mono text-[9px] leading-relaxed text-amber-200" data-testid="tutorial-debug">
              <div>lesson: {lesson.id} · step: {step.id} · kind: {step.kind}</div>
              <div>event: {lastEvent !== null ? describeEvent(lastEvent) : '—'}</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
