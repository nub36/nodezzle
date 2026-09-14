/**
 * Каталог уроков Академии. Наполняется в части 5.11D (базовый курс)
 * и далее; движок и интерфейс не хардкодят уроки — только читают каталог.
 */

import '@/blocks'; // наполнение реестра: каталог обязан быть самодостаточным
import { blockRegistry } from '@/core/registry/block-registry';
import type { LessonDefinition } from './types';
import { validateCatalog } from './validate';
import { baseCourse } from './lessons/base-course';

/** Уроки в порядке прохождения (уровень, затем порядок внутри уровня). */
export const lessons: readonly LessonDefinition[] = [
  ...baseCourse, // 5.11D: базовый курс «NODEZZLE с нуля»
];

export function getLesson(id: string): LessonDefinition | undefined {
  return lessons.find((l) => l.id === id);
}

/** Уроки, связанные с деталью (для перекрёстных ссылок из справки). */
export function lessonsForBlock(blockId: string): LessonDefinition[] {
  return lessons.filter((l) => l.relatedBlockIds?.includes(blockId) === true);
}

/**
 * Ошибки целостности каталога относительно РЕАЛЬНОГО реестра блоков.
 * Вызывается автотестом каталога (5.11D+) — битые ссылки невозможны.
 */
export function catalogErrors(): string[] {
  return validateCatalog(lessons, blockRegistry);
}
