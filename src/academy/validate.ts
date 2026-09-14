/**
 * Валидация уроков Академии.
 *
 * Главное правило честности: урок не может требовать действие, которого
 * нет в продукте. Все `blockId` обязаны существовать в реальном реестре;
 * интерактивные шаги по незапланированным функциям запрещены.
 */

import type { LessonDefinition, LessonStep } from './types';
import { DEBUG_PANEL_TABS } from '@/lib/debug-tabs';

const STEP_KINDS = new Set([
  'information',
  'open-page',
  'add-block',
  'connect',
  'configure',
  'run',
  'send-simulator-message',
  'select-block',
  'create-model',
  'open-debug',
  'publish-preview',
  'quiz',
]);

function blockIdsOfStep(step: LessonStep): string[] {
  switch (step.kind) {
    case 'add-block':
    case 'select-block':
    case 'configure':
      return [step.blockId];
    case 'connect':
      return [step.fromBlockId, step.toBlockId];
    default:
      return [];
  }
}

/** Ошибки одного урока (пустой список — урок корректен). */
export function validateLesson(
  lesson: LessonDefinition,
  registry: { has(id: string): boolean },
): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9._-]+$/i.test(lesson.id)) {
    errors.push(`Некорректный идентификатор урока: «${lesson.id}»`);
  }
  if (lesson.level < 1 || lesson.level > 9) {
    errors.push(`${lesson.id}: уровень должен быть 1..9`);
  }
  if (lesson.steps.length === 0) {
    errors.push(`${lesson.id}: урок без шагов`);
  }
  const stepIds = new Set<string>();
  for (const step of lesson.steps) {
    if (stepIds.has(step.id)) {
      errors.push(`${lesson.id}: дублирующийся шаг «${step.id}»`);
    }
    stepIds.add(step.id);
    if (!STEP_KINDS.has(step.kind)) {
      errors.push(`${lesson.id}:${step.id}: неизвестный тип шага «${String(step.kind)}»`);
      continue;
    }
    for (const blockId of blockIdsOfStep(step)) {
      if (!registry.has(blockId)) {
        errors.push(`${lesson.id}:${step.id}: блок «${blockId}» не найден в реестре`);
      }
    }
    if (step.kind === 'open-debug' && step.tab !== undefined && !DEBUG_PANEL_TABS.includes(step.tab)) {
      errors.push(`${lesson.id}:${step.id}: неизвестная вкладка отладки «${step.tab}»`);
    }
    if (step.kind === 'quiz') {
      if (step.options.length < 2) {
        errors.push(`${lesson.id}:${step.id}: викторина — минимум два варианта`);
      }
      if (!step.options.some((o) => o.correct)) {
        errors.push(`${lesson.id}:${step.id}: у викторины нет правильного ответа`);
      }
      const optionIds = new Set<string>();
      for (const option of step.options) {
        if (optionIds.has(option.id)) {
          errors.push(`${lesson.id}:${step.id}: дублирующийся вариант «${option.id}»`);
        }
        optionIds.add(option.id);
      }
    }
    if (step.kind === 'configure' && step.equals === undefined && step.notEmpty !== true) {
      errors.push(`${lesson.id}:${step.id}: настройка без условия (equals или notEmpty)`);
    }
  }
  for (const blockId of lesson.relatedBlockIds ?? []) {
    if (!registry.has(blockId)) {
      errors.push(`${lesson.id}: связанный блок «${blockId}» не найден в реестре`);
    }
  }
  return errors;
}

/** Целостность каталога уроков: уникальность, зависимости, циклы. */
export function validateCatalog(
  lessons: readonly LessonDefinition[],
  registry: { has(id: string): boolean },
): string[] {
  const errors: string[] = [];
  const byId = new Map<string, LessonDefinition>();
  for (const lesson of lessons) {
    if (byId.has(lesson.id)) {
      errors.push(`Дублирующийся урок «${lesson.id}»`);
    }
    byId.set(lesson.id, lesson);
    errors.push(...validateLesson(lesson, registry));
  }
  // Зависимости существуют.
  for (const lesson of lessons) {
    for (const prereq of lesson.prerequisites) {
      if (!byId.has(prereq)) {
        errors.push(`${lesson.id}: неизвестный предшествующий урок «${prereq}»`);
      }
    }
  }
  // Циклов в зависимостях нет.
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (done.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const lesson = byId.get(id);
    if (lesson !== undefined) {
      for (const prereq of lesson.prerequisites) {
        if (visit(prereq)) {
          errors.push(`Цикл зависимостей с участием урока «${id}»`);
          visiting.delete(id);
          return true;
        }
      }
    }
    visiting.delete(id);
    done.add(id);
    return false;
  };
  for (const lesson of lessons) visit(lesson.id);
  return errors;
}
