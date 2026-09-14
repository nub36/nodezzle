/**
 * Прогресс обучения: начатые/завершённые уроки, текущий шаг, проценты.
 *
 * Хранилище — за интерфейсом `ProgressStorage`. Сейчас — LocalStorage
 * (первый этап допустим); интерфейс готов к серверному хранилищу
 * пользователя (АПИ прогресса появится вместе с развитием аккаунтов —
 * см. docs/ACADEMY.md, раздел «Прогресс»).
 */

import {
  emptyProgress,
  type AcademyProgress,
  type LessonDefinition,
  type LessonProgress,
} from './types';

export interface ProgressStorage {
  load(): AcademyProgress;
  save(progress: AcademyProgress): void;
}

export const ACADEMY_PROGRESS_KEY = 'nodezzle-academy-v1';

function isValidProgress(value: unknown): value is AcademyProgress {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as AcademyProgress;
  if (typeof candidate.lessons !== 'object' || candidate.lessons === null) return false;
  if (typeof candidate.onboarding !== 'object' || candidate.onboarding === null) return false;
  return typeof candidate.onboarding.done === 'boolean';
}

/** Локальное хранилище в памяти — фолбэк, если `localStorage` недоступен. */
const memory = new Map<string, string>();
const memoryStorage: Storage = {
  get length() {
    return memory.size;
  },
  clear: () => memory.clear(),
  getItem: (k) => (memory.has(k) ? memory.get(k)! : null),
  key: (i) => [...memory.keys()][i] ?? null,
  removeItem: (k) => {
    memory.delete(k);
  },
  setItem: (k, v) => {
    memory.set(k, String(v));
  },
};

function resolveStorage(): Storage {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* приватный режим — работаем в памяти */
  }
  return memoryStorage;
}

/** LocalStorage-хранилище прогресса (устойчиво к битым данным). */
export function createLocalStorageProgress(key: string = ACADEMY_PROGRESS_KEY): ProgressStorage {
  const storage = resolveStorage();
  return {
    load() {
      try {
        const raw = storage.getItem(key);
        if (raw === null || raw === '') return emptyProgress();
        const parsed: unknown = JSON.parse(raw);
        return isValidProgress(parsed) ? parsed : emptyProgress();
      } catch {
        return emptyProgress();
      }
    },
    save(progress) {
      try {
        storage.setItem(key, JSON.stringify(progress));
      } catch {
        /* переполнение и т.п. — прогресс живёт в памяти */
      }
    },
  };
}

const lessonProgressOf = (progress: AcademyProgress, lessonId: string): LessonProgress =>
  progress.lessons[lessonId] ?? { status: 'not-started', stepIndex: 0, startedAt: null, completedAt: null };

/** Урок доступен, если завершены все предшествующие. */
export function isLessonAvailable(
  progress: AcademyProgress,
  lessons: readonly LessonDefinition[],
  lessonId: string,
): boolean {
  const lesson = lessons.find((l) => l.id === lessonId);
  if (lesson === undefined) return false;
  return lesson.prerequisites.every(
    (id) => lessonProgressOf(progress, id).status === 'completed',
  );
}

/** Следующий доступный незавершённый урок (по порядку каталога). */
export function nextLesson(
  progress: AcademyProgress,
  lessons: readonly LessonDefinition[],
): LessonDefinition | null {
  for (const lesson of lessons) {
    const state = lessonProgressOf(progress, lesson.id);
    if (state.status === 'completed') continue;
    if (isLessonAvailable(progress, lessons, lesson.id)) return lesson;
  }
  return null;
}

/** Процент завершения урока (по шагам). */
export function lessonPercent(progress: AcademyProgress, lesson: LessonDefinition): number {
  const state = lessonProgressOf(progress, lesson.id);
  if (state.status === 'completed') return 100;
  if (lesson.steps.length === 0) return 0;
  return Math.round((Math.min(state.stepIndex, lesson.steps.length) / lesson.steps.length) * 100);
}

/** Процент завершения уровня. */
export function levelPercent(
  progress: AcademyProgress,
  lessons: readonly LessonDefinition[],
  level: number,
): number {
  const levelLessons = lessons.filter((l) => l.level === level);
  if (levelLessons.length === 0) return 0;
  const total = levelLessons.reduce((sum, l) => sum + lessonPercent(progress, l), 0);
  return Math.round(total / levelLessons.length);
}

/** Общий процент по всему каталогу. */
export function totalPercent(progress: AcademyProgress, lessons: readonly LessonDefinition[]): number {
  if (lessons.length === 0) return 0;
  const total = lessons.reduce((sum, l) => sum + lessonPercent(progress, l), 0);
  return Math.round(total / lessons.length);
}

/* --- Чистые преобразования прогресса (тестируемые) --- */

export function startLesson(progress: AcademyProgress, lessonId: string, now: number): AcademyProgress {
  const current = lessonProgressOf(progress, lessonId);
  if (current.status !== 'not-started') return progress;
  return {
    ...progress,
    lessons: {
      ...progress.lessons,
      [lessonId]: { status: 'in-progress', stepIndex: 0, startedAt: now, completedAt: null },
    },
  };
}

export function advanceLesson(
  progress: AcademyProgress,
  lesson: LessonDefinition,
  stepIndex: number,
  now: number,
): AcademyProgress {
  const current = lessonProgressOf(progress, lesson.id);
  const clamped = Math.max(0, Math.min(stepIndex, lesson.steps.length));
  const completed = clamped >= lesson.steps.length;
  return {
    ...progress,
    lessons: {
      ...progress.lessons,
      [lesson.id]: {
        status: completed ? 'completed' : 'in-progress',
        stepIndex: clamped,
        startedAt: current.startedAt ?? now,
        completedAt: completed ? now : null,
      },
    },
  };
}

/**
 * Сброс урока: обнуляется ТОЛЬКО учебное состояние этого урока
 * (и его песочница — этим занимается интерфейс). Реальные проекты
 * пользователя не трогаются.
 */
export function resetLesson(progress: AcademyProgress, lessonId: string): AcademyProgress {
  const lessons = { ...progress.lessons };
  delete lessons[lessonId];
  return { ...progress, lessons };
}

export function setOnboarding(
  progress: AcademyProgress,
  choice: 'telegram' | 'web' | 'explore' | null,
): AcademyProgress {
  return { ...progress, onboarding: { done: true, choice } };
}
