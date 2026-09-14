/**
 * QA-манифест Академии: статическая проверка ВСЕХ уроков на достижимость.
 * Для каждого урока фиксируются шаги, требуемые детали, порты и действия;
 * валидатор гарантирует, что манифест не содержит невозможных шагов.
 */

import { describe, expect, it } from 'vitest';
import { blockRegistry } from '@/core/registry/block-registry';
import { lessons } from './catalog';
import { deepValidateCatalog, deepValidateLesson } from './validate-deep';
import type { LessonDefinition, LessonStep, TutorialTarget } from './types';

interface StepManifest {
  id: string;
  kind: LessonStep['kind'];
  interactive: boolean;
  blockTypes: string[];
  ports: string[];
}

interface LessonManifest {
  lessonId: string;
  steps: number;
  interactiveSteps: number;
  requiredBlockTypes: string[];
  requiredPorts: string[];
  actions: string[];
  stepManifest: StepManifest[];
}

const NON_INTERACTIVE = new Set(['information', 'publish-preview']);

function buildManifest(lesson: LessonDefinition): LessonManifest {
  const blockTypes = new Set<string>();
  const ports = new Set<string>();
  const actions = new Set<string>();
  const stepManifest: StepManifest[] = lesson.steps.map((step) => {
    const stepBlocks: string[] = [];
    if (step.kind === 'add-block' || step.kind === 'select-block' || step.kind === 'configure') {
      stepBlocks.push(step.blockId);
    }
    if (step.kind === 'connect') {
      stepBlocks.push(step.fromBlockId, step.toBlockId);
      if (step.fromPortId !== undefined) ports.add(`${step.fromBlockId}:${step.fromPortId}`);
      if (step.toPortId !== undefined) ports.add(`${step.toBlockId}:${step.toPortId}`);
    }
    stepBlocks.forEach((b) => blockTypes.add(b));
    actions.add(step.kind);
    return {
      id: step.id,
      kind: step.kind,
      interactive: !NON_INTERACTIVE.has(step.kind),
      blockTypes: stepBlocks,
      ports: step.kind === 'connect'
        ? [step.fromPortId, step.toPortId].filter((p): p is string => p !== undefined)
        : [],
    };
  });
  return {
    lessonId: lesson.id,
    steps: lesson.steps.length,
    interactiveSteps: stepManifest.filter((s) => s.interactive).length,
    requiredBlockTypes: [...blockTypes],
    requiredPorts: [...ports],
    actions: [...actions],
    stepManifest,
  };
}

describe('Углублённый валидатор уроков', () => {
  it('все уроки каталога проходят углублённую валидацию по живому реестру', () => {
    expect(deepValidateCatalog(lessons, blockRegistry)).toEqual([]);
  });

  it('ошибка: несуществующий порт в шаге connect', () => {
    const lesson: LessonDefinition = {
      id: 'qa.fake', level: 1, track: 'basics', titleKey: 't', descriptionKey: 'd',
      estimatedMinutes: 1, difficulty: 'basic', prerequisites: [], sandbox: true,
      steps: [{
        id: 'c1', kind: 'connect', fromBlockId: 'core.text', toBlockId: 'debug.log',
        fromPortId: 'нет-такого-порта', titleKey: 't', textKey: 'x',
      } as LessonStep],
    };
    const errors = deepValidateLesson(lesson, blockRegistry);
    expect(errors.some((e) => e.includes('нет-такого-порта'))).toBe(true);
  });

  it('ошибка: настройка, которой нет у детали', () => {
    const lesson: LessonDefinition = {
      id: 'qa.fake2', level: 1, track: 'basics', titleKey: 't', descriptionKey: 'd',
      estimatedMinutes: 1, difficulty: 'basic', prerequisites: [], sandbox: true,
      steps: [{
        id: 'cfg', kind: 'configure', blockId: 'core.text', configKey: 'нет-такого-ключа',
        notEmpty: true, titleKey: 't', textKey: 'x',
      } as LessonStep],
    };
    const errors = deepValidateLesson(lesson, blockRegistry);
    expect(errors.some((e) => e.includes('нет-такого-ключа'))).toBe(true);
  });

  it('ошибка: неизвестная цель подсветки', () => {
    const lesson: LessonDefinition = {
      id: 'qa.fake3', level: 1, track: 'basics', titleKey: 't', descriptionKey: 'd',
      estimatedMinutes: 1, difficulty: 'basic', prerequisites: [], sandbox: true,
      steps: [{ id: 'i1', kind: 'information', target: 'кнопка-которой-нет' as unknown as TutorialTarget, titleKey: 't', textKey: 'x' } as LessonStep],
    };
    const errors = deepValidateLesson(lesson, blockRegistry);
    expect(errors.some((e) => e.includes('кнопка-которой-нет'))).toBe(true);
  });

  it('ошибка: шаг на холсте в уроке без песочницы', () => {
    const lesson: LessonDefinition = {
      id: 'qa.fake4', level: 1, track: 'basics', titleKey: 't', descriptionKey: 'd',
      estimatedMinutes: 1, difficulty: 'basic', prerequisites: [], sandbox: false,
      steps: [{ id: 'a1', kind: 'add-block', blockId: 'core.text', titleKey: 't', textKey: 'x' } as LessonStep],
    };
    const errors = deepValidateLesson(lesson, blockRegistry);
    expect(errors.some((e) => e.includes('без песочницы'))).toBe(true);
  });

  it('ошибка: маршрут, которого нет в приложении', () => {
    const lesson: LessonDefinition = {
      id: 'qa.fake5', level: 1, track: 'basics', titleKey: 't', descriptionKey: 'd',
      estimatedMinutes: 1, difficulty: 'basic', prerequisites: [], sandbox: false,
      steps: [{ id: 'p1', kind: 'open-page', route: '/нет-такой-страницы', titleKey: 't', textKey: 'x' } as LessonStep],
    };
    const errors = deepValidateLesson(lesson, blockRegistry);
    expect(errors.some((e) => e.includes('/нет-такой-страницы'))).toBe(true);
  });
});

describe('QA-манифест курса', () => {
  const manifests = lessons.map(buildManifest);

  it('в курсе минимум 10 уроков, минимум 10 — интерактивные', () => {
    expect(manifests.length).toBeGreaterThanOrEqual(10);
    const interactive = manifests.filter((m) => m.interactiveSteps > 0);
    expect(interactive.length).toBeGreaterThanOrEqual(10);
  });

  it('каждая требуемая деталь манифеста существует в реестре', () => {
    for (const m of manifests) {
      for (const blockId of m.requiredBlockTypes) {
        expect(blockRegistry.has(blockId), `${m.lessonId} → ${blockId}`).toBe(true);
      }
    }
  });

  it('каждый требуемый порт манифеста существует у своей детали', () => {
    for (const m of manifests) {
      for (const ref of m.requiredPorts) {
        const [blockId, portId] = ref.split(':');
        const def = blockRegistry.get(blockId);
        expect(def, ref).toBeDefined();
        const has = [...(def?.inputs ?? []), ...(def?.outputs ?? [])].some((p) => p.id === portId);
        expect(has, `${m.lessonId} → ${ref}`).toBe(true);
      }
    }
  });

  it('у каждого урока есть шаги и действия зафиксированы', () => {
    for (const m of manifests) {
      expect(m.steps, m.lessonId).toBeGreaterThan(0);
      expect(m.actions.length, m.lessonId).toBeGreaterThan(0);
    }
  });
});
