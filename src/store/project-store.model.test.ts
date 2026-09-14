/**
 * Интеграционный тест создания модели из выделенного (Этап 2, подэтап G):
 * экшен стора поверх реального реестра блоков и чистого `extractModel`.
 *
 * Цепочка: [Текст] → (выделено) Число из текста → Текст из числа → [Условие].
 * После экшена две средние детали заменяются на `Вызов модели` с конвертерами.
 */

import '../blocks'; // регистрация всех блоков приложения

import { beforeEach, describe, expect, it } from 'vitest';
import type { CanvasDocument } from '@/core/project/schema';
import { canvasToFlow } from '@/core/project/serialize';
import { useProjectStore } from './project-store';

function makeDoc(): CanvasDocument {
  return {
    id: 'canvas-1',
    name: 'Холст',
    nodes: [
      { id: 'src', blockId: 'core.text', position: { x: 0, y: 0 }, config: { value: 'привет' } },
      { id: 'n1', blockId: 'data.text_to_number', position: { x: 200, y: 0 }, config: {} },
      { id: 'n2', blockId: 'data.number_to_text', position: { x: 400, y: 0 }, config: {} },
      { id: 'tgt', blockId: 'logic.condition', position: { x: 600, y: 0 }, config: {} },
    ],
    edges: [
      { id: 'e1', source: 'src', sourcePort: 'text', target: 'n1', targetPort: 'value' },
      { id: 'e2', source: 'n1', sourcePort: 'value', target: 'n2', targetPort: 'value' },
      { id: 'e3', source: 'n2', sourcePort: 'value', target: 'tgt', targetPort: 'value' },
    ],
  };
}

function loadDoc(doc: CanvasDocument, selected: string[]) {
  const flow = canvasToFlow(doc);
  useProjectStore.setState({
    project: {
      formatVersion: 1,
      id: 'proj-1',
      name: 'Проект',
      kind: 'telegram',
      canvas: doc,
      models: [],
      variables: [],
      meta: { createdAt: 1, updatedAt: 1 },
    },
    nodes: flow.nodes.map((n) => ({ ...n, selected: selected.includes(n.id) })),
    edges: flow.edges,
    selectedNodeId: selected[0] ?? null,
    activeModelId: null,
  });
}

describe('Создание модели из выделенного (экшен стора)', () => {
  beforeEach(() => loadDoc(makeDoc(), ['n1', 'n2']));

  it('создаёт модель, заменяет выделение вызовом модели с конвертерами', () => {
    const err = useProjectStore.getState().createModelFromSelection('Парсер');
    expect(err).toBeNull();

    const s = useProjectStore.getState();
    expect(s.project?.models).toHaveLength(1);
    const model = s.project!.models[0];
    expect(model.name).toBe('Парсер');
    expect(model.contract.inputs.map((p) => p.type)).toEqual(['text']);
    expect(model.contract.outputs.map((p) => p.type)).toEqual(['text']);
    expect(model.contract.error).toBeUndefined();

    // Внутренний холст модели: вход → детали → выход.
    const inner = model.canvas.nodes.map((n) => n.blockId).sort();
    expect(inner).toEqual(['core.input', 'core.output', 'data.number_to_text', 'data.text_to_number']);

    // Внешний холст: вызов модели + конвертеры вместо выделенных деталей.
    const outerBlocks = s.nodes.map((n) => n.data.blockId);
    expect(outerBlocks).toContain('models.call');
    expect(outerBlocks).toContain('data.to_object');
    expect(outerBlocks).toContain('data.from_object');
    expect(outerBlocks).not.toContain('data.text_to_number');
    expect(outerBlocks).not.toContain('data.number_to_text');

    // Граничная связь: Текст → В объект → Вызов модели (входной объект).
    const toObject = s.nodes.find((n) => n.data.blockId === 'data.to_object')!;
    const call = s.nodes.find((n) => n.data.blockId === 'models.call')!;
    expect(s.edges.some((e) => e.source === 'src' && e.target === toObject.id)).toBe(true);
    expect(s.edges.some((e) => e.source === toObject.id && e.target === call.id)).toBe(true);
    expect((toObject.data.config as { key?: string }).key).toBe(model.contract.inputs[0].id);
    expect((call.data.config as { modelId?: string }).modelId).toBe(model.id);

    // Выход: Вызов модели (результат) → Из объекта → Условие.
    const fromObject = s.nodes.find((n) => n.data.blockId === 'data.from_object')!;
    expect(s.edges.some((e) => e.source === call.id && e.target === fromObject.id)).toBe(true);
    expect(s.edges.some((e) => e.source === fromObject.id && e.target === 'tgt')).toBe(true);
    expect((fromObject.data.config as { key?: string }).key).toBe(model.contract.outputs[0].id);

    // Узел вызова модели выбран; цвет рёбер проставлен.
    expect(s.selectedNodeId).toBe(call.id);
    expect(s.edges.every((e) => typeof e.data?.color === 'string')).toBe(true);
  });

  it('отклоняет выделение меньше двух деталей', () => {
    loadDoc(makeDoc(), ['n1']);
    const err = useProjectStore.getState().createModelFromSelection('Модель 1');
    expect(err).toBe('ERR_MODEL_EXTRACT_EMPTY');
    expect(useProjectStore.getState().project?.models).toHaveLength(0);
  });

  it('работает без внешних связей (пустой контракт)', () => {
    loadDoc(makeDoc(), ['n1', 'n2']);
    // Обрываем граничные связи: остаются только внутренние.
    const doc = makeDoc();
    doc.edges = [doc.edges[1]];
    loadDoc(doc, ['n1', 'n2']);
    const err = useProjectStore.getState().createModelFromSelection('Автоном');
    expect(err).toBeNull();
    const model = useProjectStore.getState().project!.models[0];
    expect(model.contract.inputs).toHaveLength(0);
    expect(model.contract.outputs).toHaveLength(0);
  });
});
