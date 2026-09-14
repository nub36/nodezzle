import '@/blocks';
import { expect, it } from 'vitest';
import { buildLayoutElement, readWebElement, WEB_TREE_LIMITS } from './layout-element';
import { executeCanvas } from '@/core/runtime/execute';
import type { CanvasNode, CanvasEdge } from '@/core/project/schema';
const leaf = { kind: 'text', text: 'Первый' };

it.each(['container', 'section', 'grid'] as const)('%s: пустой children допустим и не требует настройки JSON', (kind) => {
  const result = buildLayoutElement(kind, {}, {});
  expect(result).toMatchObject({ kind, children: [] });
  if (kind === 'section') expect(result).toHaveProperty('title', '');
  if (kind === 'grid') expect(result).toHaveProperty('columns', 2);
});
it('входы приоритетнее настроек, пустая строка не подменяется заголовком', () => {
  expect(buildLayoutElement('section', { title: '', children: [leaf] }, { title: 'Настройка' })).toEqual({ kind: 'section', title: '', children: [leaf] });
  expect(buildLayoutElement('grid', { columns: 6 }, { columns: 2 })).toHaveProperty('columns', 6);
  expect(buildLayoutElement('section', { title: null }, {})).toBeNull();
});
it.each([0, 7, 2.5, '2', null, Infinity])('не принимает колонки %s ни из входа, ни из настройки', (columns) => {
  expect(buildLayoutElement('grid', { columns }, {})).toBeNull();
  expect(buildLayoutElement('grid', {}, { columns })).toBeNull();
});
it.each([null, {}, ['текст'], [null], [{ kind: 'script', text: 'alert(1)' }], [{ kind: 'heading', text: 'x', level: 7 }]])('не принимает невалидный children %j', (children) => {
  expect(buildLayoutElement('container', { children }, {})).toBeNull();
});
it('копирует только разрешённые поля, сохраняет порядок и не меняет вход', () => {
  const input = { kind: 'section', title: '<script>', html: '<script>', children: [leaf, { kind: 'grid', columns: 2, style: 'url(evil)', children: [{ kind: 'heading', text: 'Второй', level: 3 }] }] };
  const snapshot = JSON.stringify(input);
  const output = readWebElement(input);
  expect(output).toEqual({ kind: 'section', title: '<script>', children: [leaf, { kind: 'grid', columns: 2, children: [{ kind: 'heading', text: 'Второй', level: 3 }] }] });
  expect(output).not.toBe(input);
  expect(JSON.stringify(input)).toBe(snapshot);
});
it('цикл запрещён, повторное использование одного значения в соседних ветках разрешено', () => {
  const cyclic: { kind: string; children: unknown[] } = { kind: 'container', children: [] };
  cyclic.children.push(cyclic);
  expect(readWebElement(cyclic)).toBeNull();
  expect(readWebElement({ kind: 'container', children: [leaf, leaf] })).toEqual({ kind: 'container', children: [leaf, leaf] });
});
it('границы глубины, числа узлов и суммарного текста точные', () => {
  let tree: unknown = leaf;
  for (let i = 1; i < WEB_TREE_LIMITS.depth; i++) tree = { kind: 'container', children: [tree] };
  expect(readWebElement(tree)).not.toBeNull();
  expect(readWebElement({ kind: 'container', children: [tree] })).toBeNull();
  expect(readWebElement({ kind: 'container', children: Array(255).fill(leaf) })).not.toBeNull();
  expect(readWebElement({ kind: 'container', children: Array(256).fill(leaf) })).toBeNull();
  const fullText = { kind: 'text', text: 'x'.repeat(WEB_TREE_LIMITS.text) };
  expect(readWebElement({ kind: 'container', children: [fullText] })).not.toBeNull();
  expect(readWebElement({ kind: 'section', title: 'x', children: [fullText] })).toBeNull();
});

const node = (id: string, blockId: string, config: Record<string, unknown> = {}): CanvasNode => ({ id, blockId, config, position: { x: 0, y: 0 } });
const edge = (source: string, sourcePort: string, target: string, targetPort: string): CanvasEdge => ({ id: `${source}-${target}-${targetPort}`, source, sourcePort, target, targetPort });
it('runtime: листья → массивы → сетка → контейнер → секция, без новых портов и изменений движка', async () => {
  const nodes = [node('text', 'web.text', { text: 'Из схемы' }), node('empty', 'core.array', { value: '[]' }), node('a', 'data.array_add'), node('grid', 'web.grid', { columns: 3 }), node('b', 'data.array_add'), node('container', 'web.container'), node('c', 'data.array_add'), node('section', 'web.section', { title: 'Секция' })];
  const edges = [edge('text', 'element', 'a', 'item'), edge('empty', 'value', 'a', 'array'), edge('a', 'array', 'grid', 'children'), edge('grid', 'element', 'b', 'item'), edge('empty', 'value', 'b', 'array'), edge('b', 'array', 'container', 'children'), edge('container', 'element', 'c', 'item'), edge('empty', 'value', 'c', 'array'), edge('c', 'array', 'section', 'children')];
  const result = await executeCanvas({ id: 'canvas', name: 'Холст', nodes, edges });
  expect(result.status).toBe('success');
  expect(result.nodeRuns.section.outputs.element).toEqual({ kind: 'section', title: 'Секция', children: [{ kind: 'container', children: [{ kind: 'grid', columns: 3, children: [{ kind: 'text', text: 'Из схемы' }] }] }] });
});
it('runtime: невалидный ребёнок даёт ERR_WEB_TREE, а не частичную страницу', async () => {
  const result = await executeCanvas({ id: 'c', name: 'Холст', nodes: [node('array', 'core.array', { value: JSON.stringify([leaf, { kind: 'html' }]) }), node('grid', 'web.grid')], edges: [edge('array', 'value', 'grid', 'children')] });
  expect(result.status).toBe('error');
  expect(result.nodeRuns.grid.error).toBe('ERR_WEB_TREE');
  expect(result.nodeRuns.grid.outputs.element).toBeUndefined();
});
