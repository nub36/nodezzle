/**
 * Тесты веб-превью и панели отладки (Этап 2, подэтап I часть 2):
 * сборка триггерного payload, разбор веб-деталей, запуск схемы
 * веб-событием из превью.
 */

import '../blocks'; // регистрация всех блоков приложения

import { beforeEach, describe, expect, it } from 'vitest';
import type { CanvasDocument } from '@/core/project/schema';
import { canvasToFlow } from '@/core/project/serialize';
import { blockRegistry } from '@/core/registry/block-registry';
import { collectWebElements } from '@/features/canvas/web-preview-utils';
import { useProjectStore } from './project-store';
import { buildTriggerPayload, useExecutionStore, type SimulatorPayload } from './execution-store';

const baseSim: SimulatorPayload = {
  source: 'telegram',
  text: 'привет',
  userId: 1,
  chatId: 2,
  command: '',
  webJson: '{"a": 1}',
};

describe('buildTriggerPayload — источник и состав события', () => {
  it('телеграм-триггеры на схеме побеждают выбор симулятора', () => {
    const p = buildTriggerPayload({ ...baseSim, source: 'web' }, ['telegram_events']);
    expect(p.source).toBe('telegram');
    expect(p.telegram?.text).toBe('привет');
  });

  it('веб-триггеры на схеме побеждают выбор симулятора', () => {
    const p = buildTriggerPayload(baseSim, ['web_events']);
    expect(p.source).toBe('web');
    expect(p.web).toEqual({ a: 1 });
  });

  it('при смешанных триггерах решают настройки симулятора', () => {
    expect(buildTriggerPayload(baseSim, ['telegram_events', 'web_events']).source).toBe('telegram');
    expect(buildTriggerPayload({ ...baseSim, source: 'web' }, ['telegram_events', 'web_events']).source).toBe('web');
  });

  it('команда попадает в payload только непустая', () => {
    const withCmd = buildTriggerPayload({ ...baseSim, command: '/start' }, ['telegram_events']);
    expect(withCmd.telegram?.command).toBe('/start');
    const noCmd = buildTriggerPayload(baseSim, ['telegram_events']);
    expect(noCmd.telegram?.command).toBeUndefined();
  });

  it('битый JSON веб-данных превращается в пустой объект', () => {
    const p = buildTriggerPayload({ ...baseSim, webJson: '{oops' }, ['web_events']);
    expect(p.web).toEqual({});
  });
});

describe('collectWebElements — разбор веб-деталей холста', () => {
  const makeNodes = (items: Array<{ id: string; blockId: string; label?: string }>) =>
    items.map((i) => ({
      id: i.id,
      type: 'nodezzle' as const,
      position: { x: 0, y: 0 },
      data: { blockId: i.blockId, config: {}, ...(i.label ? { label: i.label } : {}) },
    }));
  const blockLabel = (key: string) => `LABEL:${key}`;

  it('находит страницу, кнопки и формы', () => {
    const els = collectWebElements(
      makeNodes([
        { id: 'p', blockId: 'web.page' },
        { id: 'b1', blockId: 'web.button' },
        { id: 'b2', blockId: 'web.button' },
        { id: 'f', blockId: 'web.form' },
        { id: 't', blockId: 'core.text' }, // не веб — игнорируется
      ]),
      (id) => blockRegistry.get(id),
      blockLabel,
    );
    expect(els.page?.nodeId).toBe('p');
    expect(els.buttons.map((b) => b.nodeId)).toEqual(['b1', 'b2']);
    expect(els.forms.map((f) => f.nodeId)).toEqual(['f']);
  });

  it('переименовка экземпляра важнее подписи блока', () => {
    const els = collectWebElements(
      makeNodes([{ id: 'b', blockId: 'web.button', label: 'Купить' }]),
      (id) => blockRegistry.get(id),
      blockLabel,
    );
    expect(els.buttons[0].label).toBe('Купить');
  });

  it('берёт первую страницу, если их несколько', () => {
    const els = collectWebElements(
      makeNodes([
        { id: 'p1', blockId: 'web.page' },
        { id: 'p2', blockId: 'web.page' },
      ]),
      (id) => blockRegistry.get(id),
      blockLabel,
    );
    expect(els.page?.nodeId).toBe('p1');
  });
});

describe('fireWebTrigger — запуск схемы веб-событием', () => {
  beforeEach(() => {
    const doc: CanvasDocument = {
      id: 'c',
      name: 'Холст',
      nodes: [{ id: 'page', blockId: 'web.page', position: { x: 0, y: 0 }, config: {} }],
      edges: [],
    };
    const flow = canvasToFlow(doc);
    useProjectStore.setState({
      project: {
        formatVersion: 1,
        id: 'proj-web',
        name: 'Веб-проект',
        kind: 'web',
        canvas: doc,
        models: [],
        variables: [],
        meta: { createdAt: 1, updatedAt: 1 },
      },
      nodes: flow.nodes,
      edges: flow.edges,
      groups: [],
      selectedNodeId: null,
      activeModelId: null,
      past: [],
      future: [],
    });
    useExecutionStore.getState().reset();
    useExecutionStore.setState({ history: [] });
  });

  it('выполняет схему с веб-триггером и пишет историю', async () => {
    await useExecutionStore.getState().fireWebTrigger({ event: 'page_load' });
    const s = useExecutionStore.getState();
    expect(s.status).toBe('success');
    expect(s.running).toBe(false);
    expect(s.history).toHaveLength(1);
    expect(s.history[0].status).toBe('success');
    // Триггер страницы выполнился и залогировал именно загрузку.
    expect(s.nodeInfo.page?.status).toBe('success');
    expect(s.logs.some((l) => l.message.startsWith('web.'))).toBe(true);
    // Веб-событие не создаёт эхо в телеграм-чате.
    expect(s.chatEcho).toBeNull();
  });

  it('клик не выполняет триггер страницы и сохраняется в истории как ожидание', async () => {
    await useExecutionStore.getState().fireWebTrigger({ event: 'button_click', button: 'ОК' });
    const state = useExecutionStore.getState();
    expect(state.status).toBe('waiting');
    expect(state.nodeInfo.page?.outputs?.data).toBeUndefined();
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toMatchObject({ source: 'web', status: 'waiting' });
  });

});
