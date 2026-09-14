/** 07B2: урок требует результат последнего запуска, а не зелёный статус схемы. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getLesson } from './catalog';
import { evaluateStep } from './completion';
import { validateLesson } from './validate';
import { deepValidateLesson } from './validate-deep';
import type { AcademySnapshot, LessonStep, RunOutputExpectation } from './types';
import { blockRegistry } from '@/core/registry/block-registry';
import { buildAcademySnapshot } from '@/features/academy/snapshot';
import { useExecutionStore } from '@/store/execution-store';
import { useProjectStore } from '@/store/project-store';
import { useTutorialStore } from '@/store/tutorial-store';
import { createDemoProject } from '@/demo/seed';
import type { NodezzleFlowNode } from '@/core/project/serialize';

const condition = getLesson('logic-condition')!.steps.find((s) => s.id === 'run')!;
const command = getLesson('telegram-command')!.steps.find((s) => s.id === 'send')!;
type Results = NonNullable<NonNullable<AcademySnapshot['lastRun']>['results']>;
const result = (blockId: string, outputs: Record<string, unknown>, status = 'success'): Results[number] =>
  ({ nodeId: blockId, blockId, status, outputs });
const snapshot = (results?: Results): AcademySnapshot => ({
  nodes: [], edges: [], lastRun: { at: 100, status: 'success', source: 'telegram', results },
});
const runStep = (expectedOutputs?: RunOutputExpectation[]): LessonStep => ({
  id: 'run', kind: 'run', titleKey: 't', textKey: 't', expectedOutputs,
});
const textNode = (value: string): NodezzleFlowNode => ({
  id: 'text-1', type: 'nodezzle', position: { x: 0, y: 0 }, data: { blockId: 'core.text', config: { value } },
});

beforeEach(() => {
  useExecutionStore.getState().reset();
  useExecutionStore.setState({ history: [] });
  useProjectStore.setState({ project: null, nodes: [], edges: [], groups: [] });
  useTutorialStore.getState().exit();
});
afterEach(() => {
  useExecutionStore.getState().reset();
  useExecutionStore.setState({ history: [] });
  useProjectStore.setState({ project: null, nodes: [], edges: [] });
  useTutorialStore.getState().exit();
});

describe('Результаты практического запуска', () => {
  it('условие: нужны выход «Да» и выполненный лог, одного success недостаточно', () => {
    expect(evaluateStep(condition, snapshot())).toBe(false);
    expect(evaluateStep(condition, snapshot([result('logic.condition', { false: 'нет' })]))).toBe(false);
    expect(evaluateStep(condition, snapshot([result('logic.condition', { true: 'да' })]))).toBe(false);
    expect(evaluateStep(condition, snapshot([
      result('logic.condition', { true: 'да' }), result('debug.log', { value: 'да' }),
    ]))).toBe(true);
  });

  it('команда: /help с отправкой не подменяет /start; один триггер без ответа не подходит', () => {
    const send = result('telegram.send_message', { message_id: 9001 });
    expect(evaluateStep(command, snapshot([result('telegram.command', { command: '/help' }), send]))).toBe(false);
    expect(evaluateStep(command, snapshot([result('telegram.command', { command: '/start' })]))).toBe(false);
    expect(evaluateStep(command, snapshot([result('telegram.command', { command: '/start' }), send]))).toBe(true);
  });

  it('учитываются только собственные определённые выходы успешных деталей', () => {
    const step = runStep([{ blockId: 'core.text', portId: 'text' }]);
    for (const status of ['running', 'skipped', 'error', 'idle']) {
      expect(evaluateStep(step, snapshot([result('core.text', { text: 'ok' }, status)]))).toBe(false);
    }
    for (const outputs of [{}, { text: undefined }, Object.create({ text: 'унаследовано' }) as Record<string, unknown>]) {
      expect(evaluateStep(step, snapshot([result('core.text', outputs)]))).toBe(false);
    }
    for (const value of [0, false, '', null]) {
      expect(evaluateStep(step, snapshot([result('core.text', { text: value })]))).toBe(true);
    }
    expect(evaluateStep(step, snapshot([result('another.block', { text: 'ok' })]))).toBe(false);
  });

  it('equals не приводит типы: текст 42 не совпадает с числом 42', () => {
    const step = runStep([{ blockId: 'data.text_to_number', portId: 'value', equals: 42 }]);
    expect(evaluateStep(step, snapshot([result('data.text_to_number', { value: '42' })]))).toBe(false);
    expect(evaluateStep(step, snapshot([result('data.text_to_number', { value: 42 })]))).toBe(true);
  });

  it('результаты не обходят проверку времени, статуса и источника запуска', () => {
    const s = snapshot([result('logic.condition', { true: 'ok' }), result('debug.log', { value: 'ok' })]);
    expect(evaluateStep(condition, s, 101)).toBe(false);
    expect(evaluateStep(condition, { ...s, lastRun: { ...s.lastRun!, source: 'web' } })).toBe(false);
    expect(evaluateStep(condition, { ...s, lastRun: { ...s.lastRun!, status: 'error' } })).toBe(false);
    expect(evaluateStep(condition, s, 99)).toBe(true);
  });

  it('старые шаги без expectedOutputs сохраняют свою семантику', () => {
    expect(evaluateStep(runStep(), snapshot())).toBe(true);
    const step: LessonStep = { id: 'send', kind: 'send-simulator-message', source: 'telegram', titleKey: 't', textKey: 't' };
    expect(evaluateStep(step, snapshot())).toBe(true);
    expect(evaluateStep({ ...runStep(), kind: 'run', require: 'finished' }, {
      ...snapshot(), lastRun: { at: 100, status: 'error' },
    })).toBe(true);
  });

  it('валидаторы отклоняют неизвестные детали/порты и пустой список требований', () => {
    const base = getLesson('logic-condition')!;
    const invalidBlock = { ...base, steps: [runStep([{ blockId: 'missing', portId: 'value' }])] };
    expect(validateLesson(invalidBlock, blockRegistry).length).toBeGreaterThan(0);
    expect(deepValidateLesson(invalidBlock, blockRegistry).length).toBeGreaterThan(0);
    const invalidPort = { ...base, steps: [runStep([{ blockId: 'core.text', portId: 'missing' }])] };
    expect(deepValidateLesson(invalidPort, blockRegistry).length).toBeGreaterThan(0);
    expect(validateLesson({ ...base, steps: [runStep([])] }, blockRegistry).length).toBeGreaterThan(0);
  });

  it('адаптер не склеивает историю с результатами другого запуска и очищает их при reset', () => {
    useProjectStore.setState({ nodes: [textNode('ok')] });
    useExecutionStore.setState({
      history: [{ id: 'run-2', at: 100, status: 'success', durationMs: 1 }],
      nodeInfoRunId: 'run-1',
      nodeInfo: { 'text-1': { status: 'success', inputs: {}, outputs: { text: 'old' }, durationMs: 1, startedAt: 1, executions: 1 } },
    });
    expect(buildAcademySnapshot().lastRun?.results).toBeUndefined();
    useExecutionStore.setState({ nodeInfoRunId: 'run-2' });
    expect(buildAcademySnapshot().lastRun?.results?.[0]).toMatchObject({ nodeId: 'text-1', blockId: 'core.text', outputs: { text: 'old' } });
    useExecutionStore.setState({ running: true });
    expect(buildAcademySnapshot().lastRun?.results).toBeUndefined();
    useExecutionStore.getState().reset();
    expect(useExecutionStore.getState().nodeInfoRunId).toBeNull();
    expect(buildAcademySnapshot().lastRun?.results).toBeUndefined();
  });

  it('источник/текст берутся из завершённого запуска, не из изменённой формы или наблюдателя', () => {
    useTutorialStore.getState().recordRun('success', 'web', 'изменённый текст');
    useExecutionStore.setState({ history: [{ id: 'r', at: 100, status: 'success', durationMs: 1, source: 'telegram', simulatorText: 'исходный текст' }] });
    useExecutionStore.getState().setPayload({ source: 'web', text: 'ещё другой текст' });
    const s = buildAcademySnapshot();
    expect(s.lastRun?.source).toBe('telegram');
    expect(s.simulatorText).toBe('исходный текст');
  });

  it('реальный runtime: правка конфигурации не подменяет результат без нового запуска', async () => {
    useProjectStore.setState({ project: createDemoProject(), nodes: [textNode('41')], edges: [], groups: [] });
    useExecutionStore.getState().setPayload({ source: 'telegram', text: 'первый текст' });
    await useExecutionStore.getState().run();
    const first = useExecutionStore.getState().history[0];
    expect(useExecutionStore.getState().nodeInfoRunId).toBe(first.id);
    expect(first.source).toBe('telegram');
    const wanted = runStep([{ blockId: 'core.text', portId: 'text', equals: '42' }]);
    useProjectStore.setState({ nodes: [textNode('42')] });
    expect(buildAcademySnapshot().lastRun?.results?.[0].outputs.text).toBe('41');
    expect(evaluateStep(wanted, buildAcademySnapshot())).toBe(false);
    await useExecutionStore.getState().run();
    expect(useExecutionStore.getState().history[0].id).not.toBe(first.id);
    expect(evaluateStep(wanted, buildAcademySnapshot())).toBe(true);
  });
});
