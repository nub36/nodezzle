/** Просмотр результатов — конкретная вкладка, а не любая открытая панель. */
import { describe, expect, it } from 'vitest';
import { evaluateStep } from './completion';
import { diffSnapshots, describeEvent } from './events';
import { getLesson } from './catalog';
import { validateLesson } from './validate';
import { DEBUG_PANEL_TABS } from '@/lib/debug-tabs';
import { buildAcademySnapshot } from '@/features/academy/snapshot';
import { useExecutionStore } from '@/store/execution-store';
import { useAcademyStore } from '@/store/academy-store';
import { useTutorialStore } from '@/store/tutorial-store';
import type { AcademySnapshot, LessonStep } from './types';

const base: AcademySnapshot = { nodes: [], edges: [] };
const portsStep: LessonStep = { id: 'ports', kind: 'open-debug', tab: 'ports', titleKey: 't', textKey: 'x' };

describe('Выбор вкладки отладки в Академии', () => {
  it('нужны открытая панель и именно требуемая вкладка', () => {
    for (const debugTab of DEBUG_PANEL_TABS) {
      expect(evaluateStep(portsStep, { ...base, debugOpen: true, debugTab })).toBe(debugTab === 'ports');
      expect(evaluateStep(portsStep, { ...base, debugOpen: false, debugTab })).toBe(false);
    }
    expect(evaluateStep(portsStep, { ...base, debugOpen: true })).toBe(false);
  });

  it('обратная совместимость: шаг без tab проверяет только открытие панели', () => {
    const legacy: LessonStep = { id: 'open', kind: 'open-debug', titleKey: 't', textKey: 'x' };
    expect(evaluateStep(legacy, { ...base, debugOpen: true })).toBe(true);
    expect(evaluateStep(legacy, { ...base, debugOpen: false, debugTab: 'ports' })).toBe(false);
  });

  it('реальные уроки требуют нужные вкладки, ID и число шагов не меняются', () => {
    expect(getLesson('data-converters')?.steps).toHaveLength(9);
    expect(getLesson('data-converters')?.steps[8]).toMatchObject({ id: 'debug', tab: 'ports' });
    expect(getLesson('telegram-first-bot')?.steps).toHaveLength(8);
    expect(getLesson('telegram-first-bot')?.steps[6]).toMatchObject({ id: 'chat', tab: 'chat' });
  });

  it('неизвестная вкладка отклоняется валидатором данных урока', () => {
    const lesson = { ...getLesson('data-converters')!, steps: [{ ...portsStep, tab: 'missing' } as unknown as LessonStep] };
    expect(validateLesson(lesson, { has: () => true }).some((e) => e.includes('неизвестная вкладка'))).toBe(true);
  });

  it('снимок берёт вкладку из реального стора исполнения', () => {
    const previous = useExecutionStore.getState().panelTab;
    try {
      useExecutionStore.getState().setPanelTab('ports');
      expect(buildAcademySnapshot().debugTab).toBe('ports');
      useExecutionStore.getState().setPanelTab('chat');
      expect(buildAcademySnapshot().debugTab).toBe('chat');
    } finally {
      useExecutionStore.getState().setPanelTab(previous);
    }
  });

  it('мост событий различает выбор вкладки и не генерирует повторы', () => {
    const prev: AcademySnapshot = { ...base, debugOpen: true, debugTab: 'simulator' };
    const next: AcademySnapshot = { ...prev, debugTab: 'ports' };
    const events = diffSnapshots(prev, next, 123);
    expect(events).toEqual([{ type: 'DEBUG_TAB_CHANGED', at: 123, data: { tab: 'ports' } }]);
    expect(describeEvent(events[0]!)).toBe('DEBUG_TAB_CHANGED ports');
    expect(diffSnapshots(next, next)).toEqual([]);
    expect(diffSnapshots({ ...prev, debugOpen: false }, { ...next, debugOpen: false })).toEqual([]);
  });

  it('интеграция: перепроверка неверной вкладки не завершает урок, нужная — завершает', () => {
    const previousTab = useExecutionStore.getState().panelTab;
    const tutorial = useTutorialStore.getState();
    try {
      tutorial.start('data-converters', 8);
      tutorial.setDebugOpen(true);
      useExecutionStore.getState().setPanelTab('simulator');
      tutorial.evaluate(buildAcademySnapshot());
      tutorial.recheck();
      tutorial.evaluate(buildAcademySnapshot());
      expect(useTutorialStore.getState().stepIndex).toBe(8);
      useExecutionStore.getState().setPanelTab('ports');
      tutorial.evaluate(buildAcademySnapshot());
      expect(useTutorialStore.getState().finished).toBe(true);
    } finally {
      tutorial.exit();
      useAcademyStore.getState().reset('data-converters');
      useExecutionStore.getState().setPanelTab(previousTab);
    }
  });
});
