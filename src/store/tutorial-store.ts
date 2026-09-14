/**
 * Стор активного урока (подэтап 5.11): текущий шаг, автопроверка,
 * подсказки. Движок проверки — чистый (`src/academy/completion.ts`);
 * стор только связывает его с интерфейсом.
 */

import { create } from 'zustand';
import { evaluateStep } from '@/academy/completion';
import { getLesson } from '@/academy/catalog';
import type { AcademySnapshot, LessonDefinition } from '@/academy/types';
import { useAcademyStore } from './academy-store';

interface TutorialState {
  lesson: LessonDefinition | null;
  stepIndex: number;
  active: boolean;
  /** Все шаги пройдены — показать «Урок завершён». */
  finished: boolean;
  hintVisible: boolean;
  /** Открыта ли панель отладки (синхронизирует CanvasPage). */
  debugOpen: boolean;
  /** Источник и текст последнего запуска (для шагов симулятора). */
  lastRunSource: string | null;
  lastSimulatorText: string | null;

  start: (lessonId: string, fromStep?: number) => void;
  stop: () => void;
  /** Пользователь прервал урок (без сброса прогресса). */
  exit: () => void;
  acknowledge: () => void;
  answerQuiz: (optionId: string) => void;
  showHint: () => void;
  hideHint: () => void;
  setDebugOpen: (open: boolean) => void;
  recordRun: (status: string, source: string, simulatorText: string) => void;
  /** Проверить текущий шаг по снимку состояния. */
  evaluate: (snapshot: AcademySnapshot) => void;
}

export const useTutorialStore = create<TutorialState>()((set, get) => ({
  lesson: null,
  stepIndex: 0,
  active: false,
  finished: false,
  hintVisible: false,
  debugOpen: false,
  lastRunSource: null,
  lastSimulatorText: null,

  start: (lessonId, fromStep = 0) => {
    const lesson = getLesson(lessonId);
    if (lesson === undefined) return;
    useAcademyStore.getState().begin(lessonId);
    set({
      lesson,
      stepIndex: Math.min(Math.max(fromStep, 0), lesson.steps.length - 1),
      active: true,
      finished: false,
      hintVisible: false,
    });
  },

  stop: () => set({ active: false, hintVisible: false }),

  exit: () => set({ lesson: null, active: false, finished: false, hintVisible: false }),

  acknowledge: () => {
    const { lesson, stepIndex, active } = get();
    if (lesson === null || !active) return;
    const step = lesson.steps[stepIndex];
    if (step === undefined) return;
    if (evaluateStep(step, { nodes: [], edges: [], acknowledged: true })) {
      get().evaluate({ nodes: [], edges: [], acknowledged: true });
    }
  },

  answerQuiz: (optionId) => {
    const { lesson, stepIndex, active } = get();
    if (lesson === null || !active) return;
    const step = lesson.steps[stepIndex];
    if (step === undefined || step.kind !== 'quiz') return;
    get().evaluate({ nodes: [], edges: [], quizAnswer: optionId });
  },

  showHint: () => set({ hintVisible: true }),
  hideHint: () => set({ hintVisible: false }),
  setDebugOpen: (open) => set({ debugOpen: open }),

  recordRun: (_status, source, simulatorText) =>
    set({ lastRunSource: source, lastSimulatorText: simulatorText }),

  evaluate: (base) => {
    const { lesson, stepIndex, active, lastRunSource, lastSimulatorText } = get();
    if (lesson === null || !active) return;
    const step = lesson.steps[stepIndex];
    if (step === undefined) return;
    const snapshot: AcademySnapshot = {
      ...base,
      simulatorText: base.simulatorText ?? lastSimulatorText ?? undefined,
    };
    if (base.lastRun !== undefined && base.lastRun !== null && base.lastRun.source === undefined && lastRunSource !== null) {
      snapshot.lastRun = { ...base.lastRun, source: lastRunSource };
    }
    if (!evaluateStep(step, snapshot)) return;

    const nextIndex = stepIndex + 1;
    useAcademyStore.getState().advance(lesson, nextIndex);
    if (nextIndex >= lesson.steps.length) {
      set({ stepIndex: lesson.steps.length, active: false, finished: true, hintVisible: false });
    } else {
      set({ stepIndex: nextIndex, hintVisible: false });
    }
  },
}));
