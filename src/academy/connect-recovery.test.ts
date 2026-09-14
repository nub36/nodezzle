/** Регрессия по скриншоту владельца: все шаги соединения, не только первая цепочка. */
import { describe, expect, it } from 'vitest';
import { lessons } from './catalog';
import { useTutorialStore } from '@/store/tutorial-store';
import type { AcademySnapshot, ConnectStep } from './types';

const cases = lessons.flatMap((lesson) => lesson.steps.flatMap((step, index) =>
  step.kind === 'connect' ? [{ lessonId: lesson.id, index, step: step as ConnectStep }] : []));

describe('Все уроки: исправление неверного порта не зависает', () => {
  it.each(cases)('$lessonId / $step.id', ({ lessonId, index, step }) => {
    useTutorialStore.getState().start(lessonId, index);
    const snapshot: AcademySnapshot = {
      nodes: [{ id: 'source', blockId: step.fromBlockId }, { id: 'target', blockId: step.toBlockId }, { id: 'extra', blockId: 'security.mask' }],
      edges: [{ sourceNodeId: 'source', targetNodeId: 'target', sourcePortId: 'wrong', targetPortId: 'wrong' }],
    };
    useTutorialStore.getState().evaluate(snapshot);
    expect(useTutorialStore.getState().stepIndex).toBe(index);
    useTutorialStore.getState().recheck();
    useTutorialStore.getState().evaluate(snapshot);
    expect(useTutorialStore.getState().stepIndex).toBe(index);
    // Исправляем соединение, не удаляя лишнюю деталь и не перезапуская урок.
    snapshot.edges[0] = { sourceNodeId: 'source', targetNodeId: 'target', sourcePortId: step.fromPortId, targetPortId: step.toPortId };
    useTutorialStore.getState().evaluate(snapshot);
    expect(useTutorialStore.getState().stepIndex).toBe(index + 1);
  });
});
