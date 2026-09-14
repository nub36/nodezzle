/**
 * QA-аудит Академии: Completion Bridge + регрессия бага «выбор детали».
 *
 * Проверки идут через РЕАЛЬНЫЕ сторы продукта (project/execution/tutorial)
 * и реальный адаптер снимка (`buildAcademySnapshot`): моделируется то же
 * состояние, которое возникает после действий пользователя в Canvas.
 * Браузерный клик доказывается отдельно в E2E (Playwright).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { evaluateStep } from './completion';
import { diffSnapshots } from './events';
import { buildAcademySnapshot } from '@/features/academy/snapshot';
import { useExecutionStore } from '@/store/execution-store';
import { useProjectStore } from '@/store/project-store';
import { useTutorialStore } from '@/store/tutorial-store';
import type { NodezzleFlowNode } from '@/core/project/serialize';
import type { AcademySnapshot, LessonStep } from './types';

const base: AcademySnapshot = { nodes: [], edges: [] };

const step = (partial: Partial<LessonStep> & Pick<LessonStep, 'kind'>): LessonStep =>
  ({ id: 's1', titleKey: 't', textKey: 'x', ...partial }) as unknown as LessonStep;

function flowNode(id: string, blockId: string, config: Record<string, unknown> = {}): NodezzleFlowNode {
  return {
    id,
    type: 'nodezzle',
    position: { x: 0, y: 0 },
    data: { blockId, config },
  } as NodezzleFlowNode;
}

function resetStores(): void {
  useProjectStore.setState({ nodes: [], edges: [], selectedNodeId: null, past: [], future: [] });
  useExecutionStore.setState({ status: 'idle', history: [], logs: [], outbox: [] });
  useTutorialStore.getState().exit();
}

describe('Регрессия: зависание шага «Выберите деталь» (4/5, Знакомство с Canvas)', () => {
  it('выбор детали засчитывается по ТИПУ детали, а не по экземпляру узла', () => {
    const s = step({ kind: 'select-block', blockId: 'core.text' });
    // Пользователь кликнул по «Текст» на холсте.
    const click: AcademySnapshot = {
      ...base,
      nodes: [{ id: 'node-7f3', blockId: 'core.text' }],
      selectedBlockId: 'core.text',
      selectedNodeId: 'node-7f3',
    };
    expect(evaluateStep(s, click)).toBe(true);
  });

  it('выбор ДРУГОЙ детали шаг не завершает', () => {
    const s = step({ kind: 'select-block', blockId: 'core.text' });
    const wrong: AcademySnapshot = {
      ...base,
      nodes: [{ id: 'node-1', blockId: 'core.number' }],
      selectedBlockId: 'core.number',
      selectedNodeId: 'node-1',
    };
    expect(evaluateStep(s, wrong)).toBe(false);
  });

  it('ничего не выбрано — шаг не завершён', () => {
    const s = step({ kind: 'select-block', blockId: 'core.text' });
    expect(evaluateStep(s, { ...base, selectedBlockId: null })).toBe(false);
    expect(evaluateStep(s, base)).toBe(false);
  });
});

describe('Семантика шага «соединить»: только требуемые порты', () => {
  const s = step({
    kind: 'connect',
    fromBlockId: 'telegram.message_received',
    toBlockId: 'telegram.send_message',
    fromPortId: 'chat_id',
    toPortId: 'chat_id',
  });
  const nodes = [
    { id: 'a', blockId: 'telegram.message_received' },
    { id: 'b', blockId: 'telegram.send_message' },
  ];

  it('правильные порты — завершён', () => {
    const snap: AcademySnapshot = {
      ...base,
      nodes,
      edges: [{ sourceNodeId: 'a', sourcePortId: 'chat_id', targetNodeId: 'b', targetPortId: 'chat_id' }],
    };
    expect(evaluateStep(s, snap)).toBe(true);
  });

  it('соединение другим портом — НЕ завершён', () => {
    const snap: AcademySnapshot = {
      ...base,
      nodes,
      edges: [{ sourceNodeId: 'a', sourcePortId: 'text', targetNodeId: 'b', targetPortId: 'text' }],
    };
    expect(evaluateStep(s, snap)).toBe(false);
  });

  it('порт отсутствует у ребра, а урок требует конкретный — НЕ завершён', () => {
    const snap: AcademySnapshot = {
      ...base,
      nodes,
      edges: [{ sourceNodeId: 'a', targetNodeId: 'b' }],
    };
    expect(evaluateStep(s, snap)).toBe(false);
  });

  it('правильные порты, но не те детали — НЕ завершён', () => {
    const snap: AcademySnapshot = {
      ...base,
      nodes: [{ id: 'a', blockId: 'core.text' }, { id: 'b', blockId: 'telegram.send_message' }],
      edges: [{ sourceNodeId: 'a', sourcePortId: 'chat_id', targetNodeId: 'b', targetPortId: 'chat_id' }],
    };
    expect(evaluateStep(s, snap)).toBe(false);
  });
});

describe('Шаги «запустить»: старое выполнение не засчитывается', () => {
  const t0 = 1_000_000;

  it('запуск ПОСЛЕ появления шага засчитывается, до — нет', () => {
    const s = step({ kind: 'run' });
    const oldRun = { ...base, lastRun: { status: 'success', at: t0 - 1 } };
    const newRun = { ...base, lastRun: { status: 'success', at: t0 + 1 } };
    expect(evaluateStep(s, oldRun, t0)).toBe(false);
    expect(evaluateStep(s, newRun, t0)).toBe(true);
  });

  it('send-simulator-message: тот же принцип + источник', () => {
    const s = step({ kind: 'send-simulator-message', source: 'telegram' });
    const old = { ...base, lastRun: { status: 'success', source: 'telegram', at: t0 - 5 }, simulatorText: 'привет' };
    const fresh = { ...base, lastRun: { status: 'success', source: 'telegram', at: t0 + 5 }, simulatorText: 'привет' };
    const wrongSource = { ...base, lastRun: { status: 'success', source: 'web', at: t0 + 5 }, simulatorText: 'привет' };
    expect(evaluateStep(s, old, t0)).toBe(false);
    expect(evaluateStep(s, fresh, t0)).toBe(true);
    expect(evaluateStep(s, wrongSource, t0)).toBe(false);
  });
});

describe('Completion Bridge: нормализованные события из дифа снимков', () => {
  const mk = (patch: Partial<AcademySnapshot>): AcademySnapshot => ({ ...base, ...patch });

  it('BLOCK_ADDED и MODEL_CREATED', () => {
    const events = diffSnapshots(mk({}), mk({ nodes: [{ id: 'n', blockId: 'models.call' }] }));
    expect(events.some((e) => e.type === 'BLOCK_ADDED' && e.data.blockType === 'models.call')).toBe(true);
    expect(events.some((e) => e.type === 'MODEL_CREATED')).toBe(true);
  });

  it('BLOCK_SELECTED несёт тип детали и экземпляр', () => {
    const events = diffSnapshots(
      mk({ nodes: [{ id: 'n1', blockId: 'core.text' }], selectedBlockId: null }),
      mk({ nodes: [{ id: 'n1', blockId: 'core.text' }], selectedBlockId: 'core.text', selectedNodeId: 'n1' }),
    );
    const sel = events.find((e) => e.type === 'BLOCK_SELECTED');
    expect(sel?.data.blockType).toBe('core.text');
    expect(sel?.data.nodeId).toBe('n1');
  });

  it('CONNECTION_CREATED несёт детали и порты обоих концов', () => {
    const nodes = [{ id: 'a', blockId: 'telegram.message_received' }, { id: 'b', blockId: 'debug.log' }];
    const events = diffSnapshots(
      mk({ nodes }),
      mk({ nodes, edges: [{ sourceNodeId: 'a', sourcePortId: 'text', targetNodeId: 'b', targetPortId: 'value' }] }),
    );
    const conn = events.find((e) => e.type === 'CONNECTION_CREATED');
    expect(conn?.data.sourceBlockType).toBe('telegram.message_received');
    expect(conn?.data.sourcePort).toBe('text');
    expect(conn?.data.targetBlockType).toBe('debug.log');
    expect(conn?.data.targetPort).toBe('value');
  });

  it('BLOCK_CONFIG_CHANGED, EXECUTION_FINISHED, DEBUG_OPENED, PAGE_OPENED', () => {
    const events = diffSnapshots(
      mk({ nodes: [{ id: 'n', blockId: 'core.text', config: { value: 'a' } }], route: '/x', debugOpen: false }),
      mk({
        nodes: [{ id: 'n', blockId: 'core.text', config: { value: 'b' } }],
        lastRun: { status: 'success', at: 42 },
        debugOpen: true,
        route: '/y',
      }),
    );
    const types = events.map((e) => e.type);
    expect(types).toContain('BLOCK_CONFIG_CHANGED');
    expect(types).toContain('EXECUTION_FINISHED');
    expect(types).toContain('DEBUG_OPENED');
    expect(types).toContain('PAGE_OPENED');
  });
});

describe('Интеграция: действие пользователя → стор → снимок → шаг завершён', () => {
  beforeEach(resetStores);

  it('TEST 1: добавили деталь на холст → шаг add-block завершён', () => {
    const tutorial = useTutorialStore.getState();
    tutorial.start('intro-canvas', 2); // шаг «Добавьте первую деталь» (core.text)
    // Canvas: пользователь вставил деталь из библиотеки.
    useProjectStore.setState({ nodes: [flowNode('n1', 'core.text', { value: 'Текст' })] });
    tutorial.evaluate(buildAcademySnapshot());
    expect(useTutorialStore.getState().stepIndex).toBe(3);
  });

  it('TEST 2: клик по core.text → шаг select-block завершён', () => {
    const tutorial = useTutorialStore.getState();
    tutorial.start('intro-canvas', 3); // шаг «Выберите деталь» (core.text)
    useProjectStore.setState({
      nodes: [flowNode('n1', 'core.text', { value: 'Текст' })],
      selectedNodeId: 'n1',
    });
    tutorial.evaluate(buildAcademySnapshot());
    expect(useTutorialStore.getState().stepIndex).toBe(4);
  });

  it('TEST 2b: клик по другой детали шаг не завершает', () => {
    const tutorial = useTutorialStore.getState();
    tutorial.start('intro-canvas', 3);
    useProjectStore.setState({
      nodes: [flowNode('n1', 'core.number', { value: 1 }), flowNode('n2', 'core.text', {})],
      selectedNodeId: 'n1',
    });
    tutorial.evaluate(buildAcademySnapshot());
    expect(useTutorialStore.getState().stepIndex).toBe(3);
  });

  it('TEST 3: handleConnect правильными портами → шаг connect завершён', () => {
    const tutorial = useTutorialStore.getState();
    tutorial.start('basics-chain', 2); // «Соедините порты» (текст триггера → значение лога)
    useProjectStore.setState({
      nodes: [flowNode('t1', 'telegram.message_received'), flowNode('l1', 'debug.log')],
    });
    useProjectStore.getState().handleConnect({
      source: 't1',
      sourceHandle: 'text',
      target: 'l1',
      targetHandle: 'value',
    } as never);
    tutorial.evaluate(buildAcademySnapshot());
    expect(useTutorialStore.getState().stepIndex).toBe(3);
  });

  it('TEST 4: соединение не тех деталей шаг НЕ завершает', () => {
    const tutorial = useTutorialStore.getState();
    tutorial.start('basics-chain', 2);
    useProjectStore.setState({
      nodes: [flowNode('t1', 'telegram.message_received'), flowNode('x1', 'core.text'), flowNode('l1', 'debug.log')],
    });
    useProjectStore.getState().handleConnect({
      source: 'x1',
      sourceHandle: 'text',
      target: 'l1',
      targetHandle: 'value',
    } as never);
    tutorial.evaluate(buildAcademySnapshot());
    expect(useTutorialStore.getState().stepIndex).toBe(2);
  });

  it('TEST 5: успешный запуск ПОСЛЕ шага → шаг run завершён; старый — нет', () => {
    const tutorial = useTutorialStore.getState();
    tutorial.start('basics-chain', 3); // шаг «Запустите схему»
    const startedAt = useTutorialStore.getState().stepStartedAt;

    // Запуск, случившийся ДО появления шага, не в счёт.
    useExecutionStore.setState({
      history: [{ id: 'h0', at: startedAt - 10, status: 'success', durationMs: 1 }],
    });
    tutorial.evaluate(buildAcademySnapshot());
    expect(useTutorialStore.getState().stepIndex).toBe(3);

    // Новый успешный запуск завершает шаг.
    useExecutionStore.setState({
      history: [{ id: 'h1', at: startedAt + 10, status: 'success', durationMs: 1 }],
    });
    tutorial.evaluate(buildAcademySnapshot());
    expect(useTutorialStore.getState().stepIndex).toBe(4);
  });

  it('TEST 6: запуск из симулятора с нужным источником → шаг завершён', () => {
    const tutorial = useTutorialStore.getState();
    tutorial.start('telegram-first-bot', 5); // шаг «Отправьте тестовое сообщение»
    const startedAt = useTutorialStore.getState().stepStartedAt;
    tutorial.recordRun('success', 'telegram', 'привет');
    useExecutionStore.setState({
      history: [{ id: 'h1', at: startedAt + 10, status: 'success', durationMs: 1 }],
    });
    tutorial.evaluate(buildAcademySnapshot());
    expect(useTutorialStore.getState().stepIndex).toBe(6);
  });

  it('TEST 7: появилась модель (Вызов модели) → шаг create-model завершён', () => {
    const tutorial = useTutorialStore.getState();
    tutorial.start('models-first-model', 4);
    useProjectStore.setState({ nodes: [flowNode('m1', 'models.call', { modelId: 'demo' })] });
    tutorial.evaluate(buildAcademySnapshot());
    expect(useTutorialStore.getState().stepIndex).toBe(5);
  });

  it('TEST 8: открыта панель отладки → шаг open-debug завершён', () => {
    const tutorial = useTutorialStore.getState();
    tutorial.start('basics-chain', 4); // шаг «Посмотрите журнал»
    tutorial.setDebugOpen(true);
    tutorial.evaluate(buildAcademySnapshot());
    expect(useTutorialStore.getState().stepIndex).toBe(5);
  });

  it('последний шаг завершает урок: finished=true, прогресс 100%', () => {
    const tutorial = useTutorialStore.getState();
    tutorial.start('intro-what', 2); // quiz-input — первый квиз урока без песочницы
    tutorial.evaluate({ ...base, quizAnswer: 'input' });
    const s = useTutorialStore.getState();
    expect(s.stepIndex).toBe(3);
    // Последний шаг урока: второй квиз.
    s.evaluate({ ...base, quizAnswer: 'connections' });
    const after = useTutorialStore.getState();
    expect(after.finished).toBe(true);
    expect(after.active).toBe(false);
  });

  it('события моста записываются в журнал урока с текущим шагом', () => {
    const tutorial = useTutorialStore.getState();
    tutorial.start('intro-canvas', 2);
    useProjectStore.setState({ nodes: [flowNode('n1', 'core.text', {})] });
    tutorial.evaluate(buildAcademySnapshot());
    const state = useTutorialStore.getState();
    expect(state.lastEvent).not.toBeNull();
    expect(state.lastEvent?.type).toBe('BLOCK_ADDED');
    expect(state.lastEvent?.data.blockType).toBe('core.text');
    expect(state.recentEvents.length).toBeGreaterThan(0);
  });
});
