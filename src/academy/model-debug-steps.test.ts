/** 07B3: существующая модель, реальные результаты и действия просмотра. */
import { describe, expect, it } from 'vitest';
import { evaluateStep } from './completion';
import { getLesson } from './catalog';
import type { AcademySnapshot } from './types';
import { buildAcademySnapshot } from '@/features/academy/snapshot';
import { useProjectStore } from '@/store/project-store';
import { createDemoProject } from '@/demo/seed';

const base: AcademySnapshot = { nodes: [], edges: [] };
const lessonStep = (lesson: string, id: string) => getLesson(lesson)!.steps.find((s) => s.id === id)!;

describe('Практика моделей и отладки', () => {
  it('пустой вызов и ссылка на отсутствующую модель не заменяют создание модели', () => {
    const step = lessonStep('models-first-model', 'create-model');
    const call = { id: 'call', blockId: 'models.call' };
    expect(evaluateStep(step, { ...base, nodes: [call], modelIds: ['m'] })).toBe(false);
    const configured = { ...call, config: { modelId: 'm' } };
    expect(evaluateStep(step, { ...base, nodes: [configured] })).toBe(false);
    expect(evaluateStep(step, { ...base, nodes: [configured], modelIds: ['another'] })).toBe(false);
    expect(evaluateStep(step, { ...base, nodes: [configured], modelIds: ['m'] })).toBe(true);
  });

  it('адаптер берёт ID моделей из текущего проекта', () => {
    const previous = useProjectStore.getState().project;
    try {
      const project = createDemoProject();
      useProjectStore.setState({ project });
      expect(buildAcademySnapshot().modelIds).toEqual(project.models.map((m) => m.id));
      useProjectStore.setState({ project: null });
      expect(buildAcademySnapshot().modelIds).toEqual([]);
    } finally { useProjectStore.setState({ project: previous }); }
  });

  it('журнал, порты и история требуют именно свою открытую вкладку, а не подтверждение чтения', () => {
    for (const [id, tab] of [['open-debug', 'log'], ['ports-tab', 'ports'], ['history-tab', 'history']] as const) {
      const step = lessonStep('debug-why-not-working', id);
      expect(step.kind).toBe('open-debug');
      expect(evaluateStep(step, { ...base, debugOpen: true, debugTab: 'chat', acknowledged: true })).toBe(false);
      expect(evaluateStep(step, { ...base, debugOpen: false, debugTab: tab })).toBe(false);
      expect(evaluateStep(step, { ...base, debugOpen: true, debugTab: tab })).toBe(true);
    }
  });

  it('общий успех без результатов не завершает новые практические запуски', () => {
    for (const [lesson, id] of [['web-first-page', 'run-web'], ['models-first-model', 'run'], ['debug-why-not-working', 'run']]) {
      expect(evaluateStep(lessonStep(lesson, id), { ...base, lastRun: { at: 100, status: 'success', source: 'web' } })).toBe(false);
    }
  });
});
