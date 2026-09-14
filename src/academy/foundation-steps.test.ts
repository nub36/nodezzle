/** 07B4: первая цепочка и границы теоретических уроков. */
import { describe, expect, it } from 'vitest';
import { getLesson } from './catalog';
import { evaluateStep } from './completion';
import type { AcademySnapshot } from './types';

const lesson = getLesson('basics-chain')!;
const step = (id: string) => lesson.steps.find((s) => s.id === id)!;
const base: AcademySnapshot = { nodes: [], edges: [] };

describe('Первая цепочка', () => {
  it('соединение требует конкретные порты обоих концов', () => {
    const nodes = [{ id: 't', blockId: 'telegram.message_received' }, { id: 'l', blockId: 'debug.log' }];
    const edge = { sourceNodeId: 't', sourcePortId: 'text', targetNodeId: 'l', targetPortId: 'value' };
    expect(evaluateStep(step('connect'), { nodes, edges: [edge] })).toBe(true);
    for (const wrong of [{ ...edge, sourcePortId: 'chat_id' }, { ...edge, targetPortId: undefined }, { ...edge, targetPortId: 'missing' }]) {
      expect(evaluateStep(step('connect'), { nodes, edges: [wrong] })).toBe(false);
    }
  });

  it('успех триггера без результата лога недостаточен; новый полный запуск подходит', () => {
    const run = { at: 100, status: 'success', results: [{ nodeId: 't', blockId: 'telegram.message_received', status: 'success', outputs: { text: 'сообщение' } }] };
    expect(evaluateStep(step('run'), { ...base, lastRun: run }, 90)).toBe(false);
    const complete = { ...run, results: [...run.results, { nodeId: 'l', blockId: 'debug.log', status: 'success', outputs: { value: 'сообщение' } }] };
    expect(evaluateStep(step('run'), { ...base, lastRun: complete }, 90)).toBe(true);
    expect(evaluateStep(step('run'), { ...base, lastRun: complete }, 101)).toBe(false);
    expect(evaluateStep(step('run'), { ...base, lastRun: { ...complete, status: 'error' } }, 90)).toBe(false);
  });

  it('журнал — отдельный просмотр, любая открытая панель не подходит', () => {
    expect(evaluateStep(step('debug'), { ...base, debugOpen: true, debugTab: 'simulator' })).toBe(false);
    expect(evaluateStep(step('debug'), { ...base, debugOpen: true, debugTab: 'ports' })).toBe(false);
    expect(evaluateStep(step('debug'), { ...base, debugOpen: false, debugTab: 'log' })).toBe(false);
    expect(evaluateStep(step('debug'), { ...base, debugOpen: true, debugTab: 'log' })).toBe(true);
  });
});

it('знакомство и публикация остаются теорией без песочницы и действий с рабочей схемой', () => {
  for (const id of ['intro-what', 'publish-versions']) {
    const theory = getLesson(id)!;
    expect(theory.sandbox).toBe(false);
    expect(theory.steps.every((s) => ['information', 'quiz', 'publish-preview'].includes(s.kind))).toBe(true);
  }
  const preview = getLesson('publish-versions')!.steps.find((s) => s.id === 'preview')!;
  expect(evaluateStep(preview, base)).toBe(false);
  expect(evaluateStep(preview, { ...base, acknowledged: true })).toBe(true);
});
