import '@/blocks';
import { expect, it } from 'vitest';
import { webLayoutRoots } from './web-layout-roots';
import { canvasToFlow } from '@/core/project/serialize';
import type { CanvasEdge } from '@/core/project/schema';
const edge = (source: string, sourcePort: string, target: string, targetPort: string): CanvasEdge => ({ id: `${source}-${target}`, source, sourcePort, target, targetPort });
const check = (pairs: [string, string][], edges: CanvasEdge[]) => {
  const flow = canvasToFlow({ id: 'c', name: 'Холст', nodes: pairs.map(([id, blockId]) => ({ id, blockId, config: {}, position: { x: 0, y: 0 } })), edges });
  const result = webLayoutRoots(flow.nodes, flow.edges);
  return { roots: result.roots.map((n) => n.id), hasCycle: result.hasCycle };
};
it('несвязанные листья и пустые структуры остаются корнями в порядке узлов', () => {
  expect(check([['a', 'web.text'], ['g', 'web.grid'], ['h', 'web.heading'], ['p', 'web.page']], [])).toEqual({ roots: ['a', 'g', 'h'], hasCycle: false });
});
it('через массив скрывается только дочерний UI, не отдельный заголовок', () => {
  expect(check([['t', 'web.text'], ['a', 'data.array_add'], ['g', 'web.grid'], ['h', 'web.heading']], [edge('t', 'element', 'a', 'item'), edge('a', 'array', 'g', 'children')])).toEqual({ roots: ['g', 'h'], hasCycle: false });
});
it('общий ребёнок не дублируется снаружи двух родителей', () => {
  expect(check([['t', 'web.text'], ['a', 'data.array_add'], ['g', 'web.grid'], ['c', 'web.container']], [edge('t', 'element', 'a', 'item'), edge('a', 'array', 'g', 'children'), edge('a', 'array', 'c', 'children')])).toEqual({ roots: ['g', 'c'], hasCycle: false });
});
it('цикл структур диагностируется даже при наличии отдельного корня; обход завершается', () => {
  expect(check([['g', 'web.grid'], ['a', 'data.array_add'], ['t', 'web.text']], [edge('g', 'element', 'a', 'item'), edge('a', 'array', 'g', 'children')])).toEqual({ roots: ['t'], hasCycle: true });
});
it('данные для заголовка секции не объявляются дочерней структурой', () => {
  expect(check([['h', 'web.heading'], ['s', 'web.section']], [edge('h', 'element', 's', 'title')])).toEqual({ roots: ['h', 's'], hasCycle: false });
});
