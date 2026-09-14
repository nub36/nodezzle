import { expect, it } from 'vitest';
import { executionGraphKey } from './execution-graph-key';
import type { NodezzleFlowNode } from '@/core/project/serialize';
const nodes: NodezzleFlowNode[] = [{ id: 'n', type: 'nodezzle', position: { x: 0, y: 0 }, data: { blockId: 'web.text', config: { text: 'x' } } }];
const key = executionGraphKey(nodes, [], 'project', null, []);
it('позиция, выделение и размеры не инвалидируют результат', () => {
  expect(executionGraphKey([{ ...nodes[0], selected: true, position: { x: 123, y: 555 }, measured: { width: 300, height: 200 } }], [], 'project', null, [])).toBe(key);
});
it('конфигурация/связи/проект/активная модель инвалидируют результат', () => {
  expect(executionGraphKey([{ ...nodes[0], data: { ...nodes[0].data, config: { text: 'new' } } }], [], 'project', null, [])).not.toBe(key);
  expect(executionGraphKey(nodes, [{ id: 'e', source: 'a', target: 'n', sourceHandle: 'text', targetHandle: 'text' }], 'project', null, [])).not.toBe(key);
  expect(executionGraphKey(nodes, [], 'other', null, [])).not.toBe(key);
  expect(executionGraphKey(nodes, [], 'project', 'model', [])).not.toBe(key);
  const models = [{ id: 'm', name: 'Модель', version: 1, updatedAt: 0, contract: { inputs: [], outputs: [] }, canvas: { id: 'c', name: 'Внутри', nodes: [], edges: [] } }];
  const before = executionGraphKey(nodes, [], 'project', null, models);
  expect(executionGraphKey(nodes, [], 'project', null, [{ ...models[0], version: 2 }])).not.toBe(before);
});
