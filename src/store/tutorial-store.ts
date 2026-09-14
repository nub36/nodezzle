/**
 * Стор активного урока (подэтап 5.11): текущий шаг, автопроверка,
 * подсказки. Движок проверки — чистый (`src/academy/completion.ts`);
 * стор только связывает его с интерфейсом.
 */

import { create } from 'zustand';
import { evaluateStep } from '@/academy/completion';
import { getLesson } from '@/academy/catalog';
import { diffSnapshots, type TutorialEvent } from '@/academy/events';
import type { AcademySnapshot, LessonDefinition } from '@/academy/types';
import { useAcademyStore } from './academy-store';

/** Размер журнала событий (диагностика «почему шаг не засчитался»). */
const EVENT_LOG_SIZE = 30;

/**
 * Completion Bridge: предыдущий снимок для вывода событий.
 * Живёт вне zustand-состояния, чтобы не вызывать лишних перерисовок.
 */
let bridgePrev: AcademySnapshot | null = null;

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
  /** Момент, когда текущий шаг стал активным (шаги «запустить» требуют нового действия). */
  stepStartedAt: number;
  /** Completion Bridge: последние нормализованные события. */
  lastEvent: TutorialEvent | null;
  recentEvents: TutorialEvent[];
  /** Счётчик ручных перепроверок («Проверить шаг»). */
  recheckTick: number;

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
  /** Записать событие моста (вызывает наблюдатель). */
  recordEvent: (event: TutorialEvent) => void;
  /** Ручная перепроверка текущего шага (фолбэк, не замена автопроверки). */
  recheck: () => void;
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
  stepStartedAt: 0,
  lastEvent: null,
  recentEvents: [],
  recheckTick: 0,

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
      stepStartedAt: Date.now(),
      lastEvent: null,
      recentEvents: [],
    });
    bridgePrev = null;
  },

  stop: () => set({ active: false, hintVisible: false }),

  exit: () => set({ lesson: null, active: false, finished: false, hintVisible: false, debugOpen: false }),

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

  recordEvent: (event) =>
    set((s) => ({
      lastEvent: event,
      recentEvents: [...s.recentEvents, event].slice(-EVENT_LOG_SIZE),
    })),

  recheck: () => set((s) => ({ recheckTick: s.recheckTick + 1 })),

  evaluate: (base) => {
    const { lesson, stepIndex, active, lastRunSource, lastSimulatorText, stepStartedAt } = get();
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

    // Мост событий: нормализованные события выводятся из полного снимка
    // состояния (кнопки «Понятно»/викторина передают минимальный снимок —
    // его диф не считаем, чтобы не порождать шум).
    if (base.nodes.length > 0 || base.edges.length > 0) {
      // До первого снимка считаем холст пустым: детали, уже стоящие на
      // схеме к моменту старта шага, тоже видны как события.
      const events = diffSnapshots(bridgePrev ?? { nodes: [], edges: [] }, snapshot);
      bridgePrev = snapshot;
      for (const event of events) {
        get().recordEvent({ ...event, stepId: step.id });
      }
    }

    if (!evaluateStep(step, snapshot, stepStartedAt)) return;

    const nextIndex = stepIndex + 1;
    useAcademyStore.getState().advance(lesson, nextIndex);
    if (nextIndex >= lesson.steps.length) {
      set({ stepIndex: lesson.steps.length, active: false, finished: true, hintVisible: false });
    } else {
      // Новый шаг: его «момент старта» отсчитывается заново.
      set({ stepIndex: nextIndex, hintVisible: false, stepStartedAt: Date.now() });
    }
  },
}));
