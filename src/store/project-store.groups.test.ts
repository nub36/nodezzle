/**
 * Тесты визуальных групп-рамок (Этап 2, подэтап F часть 2):
 * экшены стора, история, очистка при удалении, сохранение в документ.
 */

import '../blocks'; // регистрация всех блоков приложения
import '@/i18n'; // локализация (метки групп «Группа N»)

import { beforeEach, describe, expect, it } from 'vitest';
import type { CanvasDocument } from '@/core/project/schema';
import { canvasToFlow } from '@/core/project/serialize';
import { useProjectStore } from './project-store';

function makeDoc(prefix: string): CanvasDocument {
  return {
    id: `${prefix}-canvas`,
    name: 'Холст',
    nodes: ['a', 'b', 'c'].map((n, i) => ({
      id: n,
      blockId: 'core.text',
      position: { x: i * 100, y: 0 },
      config: {},
    })),
    edges: [],
  };
}

function loadDoc(doc: CanvasDocument, selected: string[] = []) {
  const flow = canvasToFlow(doc);
  useProjectStore.setState({
    project: {
      formatVersion: 1,
      id: 'proj-groups',
      name: 'Проект',
      kind: 'empty',
      canvas: doc,
      models: [{ id: 'model-1', name: 'Модель', version: 1, contract: { inputs: [], outputs: [] }, canvas: { id: 'm-canvas', name: 'Холст модели', nodes: [], edges: [] }, updatedAt: 1 }],
      variables: [],
      meta: { createdAt: 1, updatedAt: 1 },
    },
    nodes: flow.nodes.map((n) => ({ ...n, selected: selected.includes(n.id) })),
    edges: flow.edges,
    groups: doc.groups ?? [],
    selectedNodeId: null,
    activeModelId: null,
    past: [],
    future: [],
  });
}

const select = (ids: string[]) =>
  useProjectStore.setState({
    nodes: useProjectStore.getState().nodes.map((n) => ({ ...n, selected: ids.includes(n.id) })),
  });

describe('Группы (рамки) на холсте', () => {
  beforeEach(() => loadDoc(makeDoc('p')));

  it('создаёт рамку из двух и более выделенных деталей', () => {
    select(['a', 'b']);
    const id = useProjectStore.getState().groupSelection();
    expect(id).toBeTruthy();
    const groups = useProjectStore.getState().groups;
    expect(groups).toHaveLength(1);
    expect(groups[0].nodeIds).toEqual(['a', 'b']);
    expect(groups[0].label).toBe('Группа 1');
  });

  it('не создаёт рамку из одной детали', () => {
    select(['a']);
    expect(useProjectStore.getState().groupSelection()).toBeNull();
    expect(useProjectStore.getState().groups).toHaveLength(0);
  });

  it('деталь принадлежит максимум одной группе', () => {
    select(['a', 'b']);
    useProjectStore.getState().groupSelection();
    select(['b', 'c']);
    useProjectStore.getState().groupSelection();
    const groups = useProjectStore.getState().groups;
    expect(groups).toHaveLength(2);
    expect(groups[0].nodeIds).toEqual(['a']);
    expect(groups[1].nodeIds).toEqual(['b', 'c']);
  });

  it('ungroupGroup убирает рамку, детали остаются', () => {
    select(['a', 'b']);
    const id = useProjectStore.getState().groupSelection()!;
    useProjectStore.getState().ungroupGroup(id);
    expect(useProjectStore.getState().groups).toHaveLength(0);
    expect(useProjectStore.getState().nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('renameGroup переименовывает, пустое имя игнорирует', () => {
    select(['a', 'b']);
    const id = useProjectStore.getState().groupSelection()!;
    useProjectStore.getState().renameGroup(id, 'Оплата');
    expect(useProjectStore.getState().groups[0].label).toBe('Оплата');
    useProjectStore.getState().renameGroup(id, '   ');
    expect(useProjectStore.getState().groups[0].label).toBe('Оплата');
  });

  it('undo/redo восстанавливает группы', () => {
    select(['a', 'b']);
    useProjectStore.getState().groupSelection();
    expect(useProjectStore.getState().groups).toHaveLength(1);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().groups).toHaveLength(0);
    useProjectStore.getState().redo();
    expect(useProjectStore.getState().groups).toHaveLength(1);
  });

  it('удаление детали вычищает её из групп; пустые рамки исчезают', () => {
    select(['a', 'b']);
    useProjectStore.getState().groupSelection();
    select(['b']);
    useProjectStore.getState().deleteSelection();
    const groups = useProjectStore.getState().groups;
    expect(groups).toHaveLength(1);
    expect(groups[0].nodeIds).toEqual(['a']);
    select(['a']);
    useProjectStore.getState().deleteSelection();
    expect(useProjectStore.getState().groups).toHaveLength(0);
  });

  it('selectNodeIds выделяет участников группы', () => {
    useProjectStore.getState().selectNodeIds(['b', 'c']);
    const selected = useProjectStore.getState().nodes.filter((n) => n.selected).map((n) => n.id);
    expect(selected).toEqual(['b', 'c']);
  });

  it('группы сохраняются в документ при смене уровня и восстанавливаются', () => {
    select(['a', 'b']);
    useProjectStore.getState().groupSelection();
    // Открытие модели записывает холст проекта (с группами) в проект.
    useProjectStore.getState().openModel('model-1');
    expect(useProjectStore.getState().groups).toHaveLength(0); // холст модели без групп
    const savedCanvas = useProjectStore.getState().project!.canvas;
    expect(savedCanvas.groups).toHaveLength(1);
    expect(savedCanvas.groups![0].nodeIds).toEqual(['a', 'b']);
    // Возврат на холст проекта восстанавливает группы.
    useProjectStore.getState().closeModel();
    expect(useProjectStore.getState().groups).toHaveLength(1);
    expect(useProjectStore.getState().groups[0].nodeIds).toEqual(['a', 'b']);
  });
});
