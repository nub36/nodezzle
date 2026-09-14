/**
 * Тесты создания модели из выделенных деталей (Этап 2, подэтап G).
 */

import { describe, expect, it } from 'vitest';
import type { CanvasDocument } from '../project/schema';
import { definePort } from '../types/ports';
import { extractModel, type BlockPortsInfo } from './extract';

const getBlock = (id: string): BlockPortsInfo | undefined =>
  ({
    'test.trigger': {
      inputs: [],
      outputs: [definePort('text', 'l', 'data', 'text')],
      trigger: true,
    },
    'test.mid': {
      inputs: [definePort('in', 'l', 'data', 'text')],
      outputs: [definePort('out', 'l', 'data', 'text')],
    },
    'test.sink': {
      inputs: [definePort('in', 'l', 'data', 'text')],
      outputs: [],
    },
    'test.err_source': {
      inputs: [definePort('in', 'l', 'data', 'text')],
      outputs: [definePort('out', 'l', 'data', 'text'), definePort('error', 'l', 'error', 'error')],
    },
    'test.err_sink': {
      inputs: [definePort('error', 'l', 'error', 'error')],
      outputs: [],
    },
    'test.event_out': {
      inputs: [],
      outputs: [definePort('ev', 'l', 'event', 'event')],
    },
  })[id];

const portName = (_key: string, fallback: string) => `Порт ${fallback}`;

const node = (id: string, blockId: string, x = 0) => ({
  id,
  blockId,
  position: { x, y: 100 },
  config: {},
});

const edge = (id: string, source: string, sourcePort: string, target: string, targetPort: string) => ({
  id,
  source,
  sourcePort,
  target,
  targetPort,
});

function makeCanvas(nodes: ReturnType<typeof node>[], edges: ReturnType<typeof edge>[]): CanvasDocument {
  return { id: 'c', name: 'Схема', nodes, edges };
}

const baseExtract = (canvas: CanvasDocument, selectedNodeIds: string[]) =>
  extractModel({ canvas, selectedNodeIds, modelName: 'Моя модель', getBlock, portName });

describe('extractModel — создание модели из выделения', () => {
  it('извлекает фрагмент: контракт, внутренняя схема, замена на «Вызов модели»', () => {
    // триггер → A → B → приёмник; выделяем A и B
    const canvas = makeCanvas(
      [node('trg', 'test.trigger', 0), node('a', 'test.mid', 200), node('b', 'test.mid', 400), node('sink', 'test.sink', 600)],
      [
        edge('e1', 'trg', 'text', 'a', 'in'),
        edge('e2', 'a', 'out', 'b', 'in'),
        edge('e3', 'b', 'out', 'sink', 'in'),
      ],
    );
    const result = baseExtract(canvas, ['a', 'b']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { model, canvas: outer, callNodeId } = result.value;
    // Контракт: один вход (текст) и один выход (текст).
    expect(model.contract.inputs).toHaveLength(1);
    expect(model.contract.inputs[0].type).toBe('text');
    expect(model.contract.outputs).toHaveLength(1);
    expect(model.contract.outputs[0].type).toBe('text');
    expect(model.name).toBe('Моя модель');

    // Внутри: A, B + вход и выход модели.
    const innerBlocks = model.canvas.nodes.map((n) => n.blockId);
    expect(innerBlocks).toContain('core.input');
    expect(innerBlocks).toContain('core.output');
    expect(innerBlocks).toContain('test.mid');

    // Снаружи: триггер, приёмник, вызов модели и конвертеры.
    const outerBlocks = outer.nodes.map((n) => n.blockId);
    expect(outerBlocks).toContain('test.trigger');
    expect(outerBlocks).toContain('test.sink');
    expect(outerBlocks).toContain('models.call');
    expect(outerBlocks).toContain('data.to_object');
    expect(outerBlocks).toContain('data.from_object');
    expect(outerBlocks).not.toContain('test.mid');

    // Ключи конвертеров совпадают с идентификаторами контракта.
    const to = outer.nodes.find((n) => n.blockId === 'data.to_object')!;
    const from = outer.nodes.find((n) => n.blockId === 'data.from_object')!;
    expect(to.config.key).toBe(model.contract.inputs[0].id);
    expect(from.config.key).toBe(model.contract.outputs[0].id);

    // Вызов модели настроен на созданную модель и присутствует на холсте.
    const call = outer.nodes.find((n) => n.id === callNodeId)!;
    expect(call.config.modelId).toBe(model.id);
  });

  it('фрагмент без внешних связей — модель с пустым контрактом', () => {
    const canvas = makeCanvas(
      [node('a', 'test.mid', 0), node('b', 'test.sink', 200)],
      [edge('e1', 'a', 'out', 'b', 'in')],
    );
    const result = baseExtract(canvas, ['a', 'b']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.model.contract.inputs).toHaveLength(0);
    expect(result.value.model.contract.outputs).toHaveLength(0);
    const outerBlocks = result.value.canvas.nodes.map((n) => n.blockId);
    expect(outerBlocks).not.toContain('data.to_object');
    expect(outerBlocks).not.toContain('data.from_object');
    expect(outerBlocks).toContain('models.call');
  });

  it('ошибка: меньше двух деталей', () => {
    const canvas = makeCanvas([node('a', 'test.mid')], []);
    expect(baseExtract(canvas, ['a'])).toEqual({ ok: false, error: 'ERR_MODEL_EXTRACT_EMPTY' });
  });

  it('ошибка: триггер внутри выделения', () => {
    const canvas = makeCanvas(
      [node('trg', 'test.trigger'), node('a', 'test.mid', 200)],
      [edge('e1', 'trg', 'text', 'a', 'in')],
    );
    expect(baseExtract(canvas, ['trg', 'a'])).toEqual({ ok: false, error: 'ERR_MODEL_EXTRACT_TRIGGER' });
  });

  it('ошибка: больше одного внешнего входа', () => {
    const canvas = makeCanvas(
      [node('s1', 'test.trigger', 0), node('s2', 'test.trigger', 0), node('a', 'test.mid', 200), node('b', 'test.mid', 400)],
      [
        edge('e1', 's1', 'text', 'a', 'in'),
        edge('e2', 's2', 'text', 'b', 'in'),
        edge('e3', 'a', 'out', 'b', 'in'),
      ],
    );
    expect(baseExtract(canvas, ['a', 'b'])).toEqual({ ok: false, error: 'ERR_MODEL_EXTRACT_MANY_INPUTS' });
  });

  it('ошибка: событийная связь через границу', () => {
    const canvas = makeCanvas(
      [node('ev', 'test.event_out', 0), node('a', 'test.mid', 200), node('b', 'test.mid', 400)],
      [edge('e1', 'ev', 'ev', 'a', 'in'), edge('e2', 'a', 'out', 'b', 'in')],
    );
    expect(baseExtract(canvas, ['a', 'b'])).toEqual({ ok: false, error: 'ERR_MODEL_EXTRACT_UNSUPPORTED_PORT' });
  });

  it('ошибочные связи наружу становятся ERROR-портом контракта', () => {
    const canvas = makeCanvas(
      [node('x', 'test.err_source', 0), node('y', 'test.mid', 200), node('es', 'test.err_sink', 400)],
      [edge('e1', 'x', 'out', 'y', 'in'), edge('e2', 'x', 'error', 'es', 'error')],
    );
    const result = baseExtract(canvas, ['x', 'y']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.model.contract.error?.id).toBe('error');
    // Снаружи ошибка подключена напрямую к порту ошибки «Вызов модели».
    const errEdge = result.value.canvas.edges.find((e) => e.target === 'es');
    expect(errEdge?.sourcePort).toBe('error');
  });

  it('заметки не переносятся в модель', () => {
    const canvas = makeCanvas(
      [node('a', 'test.mid'), node('b', 'test.mid', 200), node('n', 'note.sticky', 400)],
      [edge('e1', 'a', 'out', 'b', 'in')],
    );
    const result = baseExtract(canvas, ['a', 'b', 'n']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.model.canvas.nodes.some((n) => n.blockId === 'note.sticky')).toBe(false);
    expect(result.value.canvas.nodes.some((n) => n.blockId === 'note.sticky')).toBe(true);
  });

  it('группы внешнего холста обрезаются: выделенные детали уходят, пустые рамки исчезают', () => {
    const canvas: CanvasDocument = {
      ...makeCanvas(
        [node('a', 'test.mid'), node('b', 'test.mid', 200), node('k', 'test.sink', 400)],
        [edge('e1', 'a', 'out', 'b', 'in'), edge('e2', 'b', 'out', 'k', 'in')],
      ),
      groups: [
        { id: 'g1', nodeIds: ['a', 'b'] }, // обе уходят внутрь модели → рамка исчезает
        { id: 'g2', label: 'Хвост', nodeIds: ['b', 'k'] }, // остаётся только 'k'
      ],
    };
    const result = baseExtract(canvas, ['a', 'b']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const groups = result.value.canvas.groups ?? [];
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('g2');
    expect(groups[0].nodeIds).toEqual(['k']);
    // Внутри модели рамок нет.
    expect(result.value.model.canvas.groups ?? []).toHaveLength(0);
  });
});
