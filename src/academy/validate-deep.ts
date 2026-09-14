/**
 * Углублённая статическая валидация уроков (QA-аудит Академии).
 *
 * Поверх базовой `validate.ts` проверяет:
 *  - порты в шагах `connect` реально существуют у деталей в реестре;
 *  - ключи настроек в `configure` есть в конфигурации детали;
 *  - цели подсветки `target` — известные элементы интерфейса;
 *  - маршруты `open-page` — существующие страницы;
 *  - уроки без песочницы не требуют действий на холсте;
 *  - для каждого типа шага существует правило проверки.
 */

import type { BlockDefinition } from '@/core/types/blocks';
import type { LessonDefinition, LessonStep, TutorialTarget } from './types';

export interface DeepRegistry {
  get(id: string): BlockDefinition | undefined;
}

const KNOWN_TARGETS: ReadonlySet<string> = new Set<TutorialTarget>([
  'library', 'canvas', 'inspector', 'run', 'debug',
  'simulator', 'chat', 'history', 'toolbar', 'none',
]);

/** Маршруты приложения (см. роутер). */
const KNOWN_ROUTES = ['/academy', '/dashboard', '/projects'];

/**
 * Типы шагов, которым нужен холст (доступны только в уроках с
 * песочницей) и для которых реализованы правила проверки.
 */
const CANVAS_STEP_KINDS: ReadonlySet<string> = new Set([
  'add-block', 'connect', 'configure', 'run', 'send-simulator-message',
  'select-block', 'create-model', 'open-debug',
]);

const IMPLEMENTED_RULES: ReadonlySet<string> = new Set([
  'information', 'open-page', 'add-block', 'connect', 'configure', 'run',
  'send-simulator-message', 'select-block', 'create-model', 'open-debug',
  'publish-preview', 'quiz',
]);

function portIds(def: BlockDefinition, direction: 'in' | 'out'): Set<string> {
  const ports = direction === 'in' ? def.inputs : def.outputs;
  return new Set(ports.map((p) => p.id));
}

function deepValidateStep(
  lessonId: string,
  step: LessonStep,
  registry: DeepRegistry,
  sandbox: boolean,
): string[] {
  const errors: string[] = [];
  const at = `${lessonId}:${step.id}`;

  if (!IMPLEMENTED_RULES.has(step.kind)) {
    errors.push(`${at}: тип шага «${step.kind}» не имеет правила проверки`);
  }
  if (step.target !== undefined && !KNOWN_TARGETS.has(step.target)) {
    errors.push(`${at}: неизвестная цель подсветки «${step.target}»`);
  }
  if (!sandbox && CANVAS_STEP_KINDS.has(step.kind)) {
    errors.push(`${at}: шаг «${step.kind}» требует холст, но урок идёт без песочницы`);
  }

  switch (step.kind) {
    case 'open-page': {
      if (!KNOWN_ROUTES.some((r) => step.route.startsWith(r))) {
        errors.push(`${at}: маршрут «${step.route}» не существует в приложении`);
      }
      break;
    }
    case 'configure': {
      const def = registry.get(step.blockId);
      if (def !== undefined && def.defaults !== undefined && !(step.configKey in def.defaults)) {
        errors.push(`${at}: настройка «${step.configKey}» отсутствует у детали «${step.blockId}»`);
      }
      break;
    }
    case 'connect': {
      const from = registry.get(step.fromBlockId);
      const to = registry.get(step.toBlockId);
      if (from !== undefined && step.fromPortId !== undefined && !portIds(from, 'out').has(step.fromPortId)) {
        errors.push(`${at}: у детали «${step.fromBlockId}» нет выходного порта «${step.fromPortId}»`);
      }
      if (to !== undefined && step.toPortId !== undefined && !portIds(to, 'in').has(step.toPortId)) {
        errors.push(`${at}: у детали «${step.toBlockId}» нет входного порта «${step.toPortId}»`);
      }
      break;
    }
    default:
      break;
  }

  return errors;
}

/** Ошибки углублённой валидации одного урока (пустой список — корректен). */
export function deepValidateLesson(
  lesson: LessonDefinition,
  registry: DeepRegistry,
): string[] {
  const errors: string[] = [];
  const stepIds = new Set<string>();
  for (const step of lesson.steps) {
    if (stepIds.has(step.id)) {
      errors.push(`${lesson.id}: дублирующийся шаг «${step.id}»`);
    }
    stepIds.add(step.id);
    errors.push(...deepValidateStep(lesson.id, step, registry, lesson.sandbox));
  }
  return errors;
}

/** Углублённая валидация всего каталога. */
export function deepValidateCatalog(
  lessons: readonly LessonDefinition[],
  registry: DeepRegistry,
): string[] {
  return lessons.flatMap((l) => deepValidateLesson(l, registry));
}
