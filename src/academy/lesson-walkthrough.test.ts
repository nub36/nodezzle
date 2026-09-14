/**
 * QA-обход ВСЕХ уроков курса: для каждого шага каждого урока
 * подбирается снимок состояния, который обязан его завершить.
 * Это доказывает, что в курсе нет невыполнимых (зависающих) шагов.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { AcademySnapshot, LessonStep, RunOutputExpectation } from './types';
import { lessons } from './catalog';
import { useTutorialStore } from '@/store/tutorial-store';
import { useAcademyStore } from '@/store/academy-store';

function base(): AcademySnapshot {
  return { nodes: [], edges: [] };
}

function node(id: string, blockId: string, config?: Record<string, unknown>): AcademySnapshot['nodes'][number] {
  return config === undefined ? { id, blockId } : { id, blockId, config };
}

function edge(
  sourceNodeId: string,
  targetNodeId: string,
  sourcePortId?: string,
  targetPortId?: string,
): AcademySnapshot['edges'][number] {
  return { sourceNodeId, targetNodeId, sourcePortId, targetPortId };
}

/** Синтетическое выполнение требований каталога. Реальный runtime проверяется отдельно. */
function successfulResults(expected: RunOutputExpectation[] | undefined) {
  return expected?.map((output, index) => ({
    nodeId: `result-${index}`,
    blockId: output.blockId,
    status: 'success',
    outputs: { [output.portId]: output.equals === undefined ? 'результат' : output.equals },
  }));
}

/** Снимок, выполняющий шаг. Шаги интерфейса (читать/викторина) возвращают null. */
function snapshotFor(step: LessonStep): AcademySnapshot | null {
  const s = base();
  const now = Date.now() + 1000; // гарантированно ПОСЛЕ начала шага
  switch (step.kind) {
    case 'information':
    case 'publish-preview':
    case 'quiz':
      return null;
    case 'open-page':
      s.route = step.route;
      return s;
    case 'add-block':
      s.nodes = [node('n1', step.blockId)];
      return s;
    case 'select-block':
      s.selectedBlockId = step.blockId;
      s.selectedNodeId = 'n1';
      return s;
    case 'configure':
      s.nodes = [node('n1', step.blockId, { [step.configKey]: step.equals ?? 'заполнено' })];
      return s;
    case 'connect':
      s.nodes = [node('a', step.fromBlockId), node('b', step.toBlockId)];
      s.edges = [edge('a', 'b', step.fromPortId, step.toPortId)];
      return s;
    case 'run':
      s.lastRun = { status: 'success', at: now, results: successfulResults(step.expectedOutputs) };
      return s;
    case 'send-simulator-message':
      s.lastRun = { status: 'success', source: step.source, at: now, results: successfulResults(step.expectedOutputs) };
      s.simulatorText = step.textContains ?? 'привет';
      return s;
    case 'create-model':
      s.nodes = [node('mn1', 'models.call')];
      return s;
    case 'open-debug':
      s.debugOpen = true;
      s.debugTab = step.tab;
      return s;
    default:
      return null;
  }
}

describe('QA: полный обход всех 12 уроков курса', () => {
  beforeEach(() => {
    for (const l of lessons) useAcademyStore.getState().reset(l.id);
    useTutorialStore.getState().exit();
  });

  for (const lesson of lessons) {
    it(`урок «${lesson.id}» проходится до конца без зависаний`, () => {
      const tutorial = useTutorialStore.getState();
      tutorial.start(lesson.id);

      for (let i = 0; i < lesson.steps.length; i += 1) {
        const step = lesson.steps[i];
        const before = useTutorialStore.getState().stepIndex;
        expect(before, `${lesson.id}: индекс шага перед «${step.id}»`).toBe(i);

        if (step.kind === 'quiz') {
          const correct = step.options.find((o) => o.correct);
          expect(correct, `${lesson.id}: у квиз-шага есть правильный вариант`).toBeDefined();
          useTutorialStore.getState().answerQuiz(correct!.id);
        } else if (step.kind === 'information' || step.kind === 'publish-preview') {
          useTutorialStore.getState().acknowledge();
        } else {
          const snapshot = snapshotFor(step);
          expect(snapshot, `${lesson.id}: шаг «${step.id}» (${step.kind}) имеет снимок-выполнитель`).not.toBeNull();
          useTutorialStore.getState().evaluate(snapshot!);
        }

        const after = useTutorialStore.getState();
        expect(after.stepIndex, `${lesson.id}: шаг «${step.id}» (${step.kind}) обязан завершиться`).toBe(i + 1);
      }

      const state = useTutorialStore.getState();
      expect(state.finished, `${lesson.id}: урок завершён`).toBe(true);
      expect(useAcademyStore.getState().progress.lessons[lesson.id]?.status).toBe('completed');
    });
  }
});
