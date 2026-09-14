/**
 * Сессия урока: учебный проект-песочница + переход в его Canvas.
 * Уроки никогда не трогают реальные проекты пользователя.
 */

import i18n from 'i18next';
import type { LessonDefinition } from '@/academy/types';
import { useProjectStore } from '@/store/project-store';

/**
 * Открывает учебный проект урока (создаёт при первом запуске)
 * и возвращает его идентификатор.
 */
export async function openLessonSandbox(lesson: LessonDefinition): Promise<string> {
  const store = useProjectStore.getState();
  const list = await store.listProjects();
  const existing = list.find((p) => p.tutorial?.lessonId === lesson.id);
  if (existing !== undefined) return existing.id;
  const created = await store.createSandboxProject(
    lesson.id,
    i18n.t('academy.sandbox.name', { title: i18n.t(lesson.titleKey) }),
  );
  return created.id;
}

/** Путь Canvas учебного проекта с параметром урока. */
export function lessonCanvasPath(projectId: string, lessonId: string): string {
  return `/projects/${projectId}?lesson=${encodeURIComponent(lessonId)}`;
}
