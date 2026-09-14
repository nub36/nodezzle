/** 08A: операции с фрагментами, без DOM и раскрытия приватного буфера. */
import '@/blocks';
import '@/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canvasToFlow, flowToCanvas } from '@/core/project/serialize';
import type { CanvasDocument } from '@/core/project/schema';
import { blockRegistry } from '@/core/registry/block-registry';
import { occupiedRects, unionRects, fitsIn, INSERT_GAP, type Rect } from '@/lib/node-placement';
import { useProjectStore } from './project-store';

const state = useProjectStore.getState;
const bounds = { x: -1000, y: -1000, width: 4000, height: 2500 };
const rects = () => occupiedRects(state().nodes, (id) => blockRegistry.get(id));
const collision = (a: Rect, b: Rect) =>
  a.x < b.x + b.width + INSERT_GAP - 1e-6 && a.x + a.width + INSERT_GAP > b.x + 1e-6 &&
  a.y < b.y + b.height + INSERT_GAP - 1e-6 && a.y + a.height + INSERT_GAP > b.y + 1e-6;

function load() {
  const doc: CanvasDocument = {
    id: 'canvas', name: 'Холст',
    nodes: [
      { id: 'a', blockId: 'core.text', label: 'Мой текст', position: { x: -100.5, y: -200.25 }, config: { value: '42', nested: { value: 7 } } },
      { id: 'b', blockId: 'debug.log', position: { x: 400.75, y: -50.375 }, config: {} },
      { id: 'c', blockId: 'debug.log', position: { x: 1200, y: 100 }, config: {} },
    ],
    edges: [
      { id: 'ab', source: 'a', sourcePort: 'text', target: 'b', targetPort: 'value' },
      { id: 'ac', source: 'a', sourcePort: 'text', target: 'c', targetPort: 'value' },
    ],
    groups: [{ id: 'group', label: 'Рамка', nodeIds: ['a', 'b'] }],
  };
  const flow = canvasToFlow(doc);
  useProjectStore.setState({
    project: { formatVersion: 1, id: 'p', name: 'Проект', kind: 'empty', canvas: doc, models: [], variables: [], meta: { createdAt: 1, updatedAt: 1 } },
    ...flow,
    nodes: flow.nodes.map((n, i) => ({ ...n, selected: i < 2, ...(i === 1 ? { measured: { width: 280, height: 420 } } : {}) })),
    groups: doc.groups, selectedNodeId: 'a', activeModelId: null, past: [], future: [], saveState: 'idle',
  });
}

beforeEach(() => { vi.useFakeTimers(); load(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

for (const operation of ['duplicate', 'paste'] as const) {
  const insert = (area = bounds) => {
    if (operation === 'paste') { state().copySelection(); return state().pasteAt(undefined, area); }
    return state().duplicateSelection(area);
  };
  describe(operation, () => {
    it('переносит без наложения единым смещением, сохраняет внутренние порты и старые позиции', () => {
      const old = state().nodes;
      const obstacles = rects();
      const ids = insert();
      const created = state().nodes.filter((n) => ids.includes(n.id));
      expect(created).toHaveLength(2);
      expect(new Set(state().nodes.map((n) => n.id)).size).toBe(5);
      for (let i = 0; i < old.length; i++) expect(state().nodes[i].position).toEqual(old[i].position);
      expect(created[1].position.x - created[0].position.x).toBe(old[1].position.x - old[0].position.x);
      expect(created[1].position.y - created[0].position.y).toBe(old[1].position.y - old[0].position.y);
      const box = unionRects(rects().slice(3))!;
      expect(fitsIn(box, box, bounds)).toBe(true);
      expect(obstacles.some((r) => collision(box, r))).toBe(false);
      expect(state().edges).toHaveLength(3);
      expect(state().edges[2]).toMatchObject({ source: ids[0], target: ids[1], sourceHandle: 'text', targetHandle: 'value', selected: false });
      expect(state().edges[2].id).not.toBe('ab');
      expect(created[0].data).toEqual(old[0].data);
      expect(created[0].data.config.nested).not.toBe(old[0].data.config.nested);
      expect(state().nodes.filter((n) => n.selected).map((n) => n.id)).toEqual(ids);
      expect(state().selectedNodeId).toBe(ids[0]);
      expect(state().groups).toEqual([{ id: 'group', label: 'Рамка', nodeIds: ['a', 'b'] }]);
    });

    it('одна операция — один шаг undo/redo, с прежними ID и координатами', () => {
      const before = structuredClone({ nodes: state().nodes, edges: state().edges, groups: state().groups });
      insert();
      const after = structuredClone({ nodes: state().nodes, edges: state().edges, groups: state().groups });
      expect(state().past).toHaveLength(1);
      expect(state().saveState).toBe('saving');
      state().undo();
      expect({ nodes: state().nodes, edges: state().edges, groups: state().groups }).toEqual(before);
      state().redo();
      expect({ nodes: state().nodes, edges: state().edges, groups: state().groups }).toEqual(after);
    });

    it('при переполнении оставляет старую схему на месте, ищет справа от всех препятствий', () => {
      const right = Math.max(...rects().map((r) => r.x + r.width));
      insert({ x: 0, y: 0, width: 10, height: 10 });
      expect(unionRects(rects().slice(3))!.x).toBeGreaterThanOrEqual(right + INSERT_GAP);
    });
  });
}

it('буфер — независимый снимок узлов и рёбер; повторные вставки читают актуальные препятствия', () => {
  state().edges[0].data = { marker: 'снимок' };
  state().copySelection();
  (state().nodes[0].data.config.nested as { value: number }).value = 999;
  state().edges[0].data!.marker = 'изменено';
  const original = structuredClone(state().nodes);
  for (let i = 0; i < 8; i++) {
    const oldRects = rects();
    const ids = state().pasteAt({ x: 0, y: 0 }, bounds);
    const box = unionRects(rects().slice(-2))!;
    expect(oldRects.some((r) => collision(box, r))).toBe(false);
    expect(state().nodes.find((n) => n.id === ids[0])!.data.config.nested).toEqual({ value: 7 });
    expect(state().edges.at(-1)!.data).toEqual({ marker: 'снимок' });
  }
  expect(state().nodes.slice(0, 3).map((n) => n.position)).toEqual(original.map((n) => n.position));
  expect(state().past).toHaveLength(8);
});

it('явная свободная позиция — левый верх фрагмента; дефолт без UI тоже исключает наложения', () => {
  state().copySelection();
  state().pasteAt({ x: -2500, y: -1000 });
  expect(unionRects(rects().slice(-2))).toMatchObject({ x: -2500, y: -1000 });
  const obstacles = rects();
  state().duplicateSelection();
  const box = unionRects(rects().slice(-2))!;
  expect(obstacles.some((r) => collision(box, r))).toBe(false);
});

it('вставка без позиции в пустой холст центрируется по переданным границам', () => {
  state().copySelection();
  useProjectStore.setState({ nodes: [], edges: [], groups: [] });
  state().pasteAt(undefined, bounds);
  const box = unionRects(rects())!;
  expect(box.x).toBe(Math.round(bounds.x + (bounds.width - box.width) / 2));
  expect(box.y).toBe(Math.round(bounds.y + (bounds.height - box.height) / 2));
});

it('пустое выделение не создаёт историю и не стирает буфер; без проекта вставка — no-op', () => {
  state().copySelection();
  state().selectNodeIds([]);
  state().copySelection();
  expect(state().duplicateSelection()).toEqual([]);
  expect(state().past).toHaveLength(0);
  expect(state().pasteAt()).toHaveLength(2);
  useProjectStore.setState({ project: null });
  expect(state().pasteAt()).toEqual([]);
  expect(state().duplicateSelection()).toEqual([]);
  expect(state().past).toHaveLength(1);
});

it('v1 сохраняет связи и настройки, дробные позиции округляются только существующим сериализатором', () => {
  const ids = state().duplicateSelection(bounds);
  const doc = flowToCanvas(state().nodes, state().edges, 'saved', 'Холст', undefined, state().groups);
  const reloaded = canvasToFlow(doc);
  for (const id of ids) {
    const node = state().nodes.find((n) => n.id === id)!;
    expect(reloaded.nodes.find((n) => n.id === id)).toMatchObject({
      data: node.data, position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
    });
  }
  expect(reloaded.edges.at(-1)).toMatchObject({ source: ids[0], target: ids[1], sourceHandle: 'text', targetHandle: 'value' });
});
