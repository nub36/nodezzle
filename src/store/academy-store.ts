/**
 * Стор Академии: прогресс обучения поверх хранилища (подэтап 5.11).
 * Интерфейс хранилища готов к серверному варианту — сейчас LocalStorage.
 */

import { create } from 'zustand';
import { lessons } from '@/academy/catalog';
import {
  advanceLesson,
  createLocalStorageProgress,
  resetLesson,
  setOnboarding,
  startLesson,
  type ProgressStorage,
} from '@/academy/progress';
import { emptyProgress, type AcademyProgress, type LessonDefinition } from '@/academy/types';

interface AcademyState {
  progress: AcademyProgress;
  /** Отметить урок начатым (идемпотентно). */
  begin: (lessonId: string) => void;
  /** Продвинуть урок до шага `stepIndex` (завершение — по длине шагов). */
  advance: (lesson: LessonDefinition, stepIndex: number) => void;
  /** Сбросить только учебное состояние урока. */
  reset: (lessonId: string) => void;
  /** Онбординг: выбор дорожки (или «пропустить»). */
  completeOnboarding: (choice: 'telegram' | 'web' | 'explore' | null) => void;
}

let storage: ProgressStorage = createLocalStorageProgress();

/** Подмена хранилища (серверный адаптер, тесты). */
export function setAcademyStorage(next: ProgressStorage): void {
  storage = next;
}

export const useAcademyStore = create<AcademyState>()((set, get) => ({
  progress: storage.load(),

  begin: (lessonId) => {
    const next = startLesson(get().progress, lessonId, Date.now());
    storage.save(next);
    set({ progress: next });
  },

  advance: (lesson, stepIndex) => {
    const next = advanceLesson(get().progress, lesson, stepIndex, Date.now());
    storage.save(next);
    set({ progress: next });
  },

  reset: (lessonId) => {
    const next = resetLesson(get().progress, lessonId);
    storage.save(next);
    set({ progress: next });
  },

  completeOnboarding: (choice) => {
    const next = setOnboarding(get().progress, choice);
    storage.save(next);
    set({ progress: next });
  },
}));

/** Перечитать прогресс из хранилища (напр. после смены адаптера). */
export function reloadAcademyProgress(): void {
  useAcademyStore.setState({ progress: storage.load() });
}

/** Справочно: сколько уроков в каталоге завершено. */
export function completedCount(progress: AcademyProgress): number {
  return lessons.filter((l) => progress.lessons[l.id]?.status === 'completed').length;
}

export { emptyProgress };
