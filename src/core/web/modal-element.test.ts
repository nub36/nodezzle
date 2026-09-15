import '@/blocks';
import { expect, it } from 'vitest';
import { buildLayoutElement, readWebElement, WEB_TREE_LIMITS } from './layout-element';
import { executeCanvas } from '@/core/runtime/execute';
import { canvasToFlow } from '@/core/project/serialize';
import { webLayoutRoots } from '@/features/canvas/web-layout-roots';

it('пустое окно допустимо, title-вход приоритетнее настройки, пустая строка сохраняется', () => {
  expect(buildLayoutElement('modal', {}, {})).toEqual({ kind: 'modal', title: '', children: [] });
  expect(buildLayoutElement('modal', { title: '' }, { title: 'Настройка' })).toHaveProperty('title', '');
  expect(buildLayoutElement('modal', { title: null }, { title: 'Настройка' })).toBeNull();
});
it('очищает атрибуты, допускает информационные структуры/URL и сохраняет порядок', () => {
  const child = { kind: 'grid', columns: 2, children: [{ kind: 'text', text: '<script>' }, { kind: 'link', href: 'https://example.com/', text: 'Сайт' }] };
  expect(readWebElement({ kind: 'modal', title: 'Окно', children: [child], open: true, onclose: 'code' })).toEqual({ kind: 'modal', title: 'Окно', children: [child] });
});
it.each([
  { kind: 'input', name: 'name', formNodeId: 'f', label: '', placeholder: '', value: '' },
  { kind: 'textarea', name: 'name', formNodeId: 'f', label: '', placeholder: '', value: '' },
  { kind: 'modal', title: 'Вложенное', children: [] },
])('не принимает скрытое поле/вложенное окно даже через контейнер: $kind', (child) => {
  expect(readWebElement({ kind: 'modal', title: '', children: [{ kind: 'container', children: [child] }] })).toBeNull();
  // Вне модального контекста те же элементы остаются допустимы.
  expect(readWebElement({ kind: 'container', children: [child] })).not.toBeNull();
});
it('независимые окна-соседи допустимы, запрет вложенности не протекает в соседнее поле', () => {
  const modal = { kind: 'modal', title: '', children: [] };
  const field = { kind: 'input', name: 'x', formNodeId: '', label: '', placeholder: '', value: '' };
  expect(readWebElement({ kind: 'container', children: [modal, modal, field] })).not.toBeNull();
});
it('общие бюджеты, невалидный URL и циклы применяются к окну', () => {
  expect(readWebElement({ kind: 'modal', title: 'x'.repeat(WEB_TREE_LIMITS.text + 1), children: [] })).toBeNull();
  expect(readWebElement({ kind: 'modal', title: '', children: [{ kind: 'image', src: 'javascript:x', caption: '' }] })).toBeNull();
  const node: { kind: string; title: string; children: unknown[] } = { kind: 'modal', title: '', children: [] };
  node.children.push(node);
  expect(readWebElement(node)).toBeNull();
});
it('runtime: массив → окно выдаёт инертный дескриптор без UI-состояния', async () => {
  const doc = { id: 'c', name: 'Холст', nodes: [
    { id: 'array', blockId: 'core.array', config: { value: '[{"kind":"text","text":"Описание"}]' }, position: { x: 0, y: 0 } },
    { id: 'modal', blockId: 'web.modal', config: { title: 'Информация' }, position: { x: 400, y: 0 } },
  ], edges: [{ id: 'e', source: 'array', sourcePort: 'value', target: 'modal', targetPort: 'children' }] };
  const result = await executeCanvas(doc);
  expect(result.status).toBe('success');
  expect(result.nodeRuns.modal.outputs.element).toEqual({ kind: 'modal', title: 'Информация', children: [{ kind: 'text', text: 'Описание' }] });
  doc.nodes[0].config.value = '[{"kind":"modal","title":"Внутреннее","children":[]}]';
  expect((await executeCanvas(doc)).nodeRuns.modal.error).toBe('ERR_WEB_TREE');
});
it('корни: окно поглощает дочерний текст через массив', () => {
  const flow = canvasToFlow({ id: 'c', name: 'Холст', nodes: ['web.text', 'data.array_add', 'web.modal'].map((blockId) => ({ id: blockId, blockId, config: {}, position: { x: 0, y: 0 } })), edges: [
    { id: 'a', source: 'web.text', sourcePort: 'element', target: 'data.array_add', targetPort: 'item' },
    { id: 'b', source: 'data.array_add', sourcePort: 'array', target: 'web.modal', targetPort: 'children' },
  ] });
  expect(webLayoutRoots(flow.nodes, flow.edges).roots.map((n) => n.id)).toEqual(['web.modal']);
});
it('явные события симулятора modal_open/close сохраняют прежнюю фильтрацию', async () => {
  const doc = { id: 'c', name: 'Холст', nodes: ['web.modal_open', 'web.modal_close'].map((blockId) => ({ id: blockId, blockId, config: {}, position: { x: 0, y: 0 } })), edges: [] };
  const result = await executeCanvas(doc, { payload: { source: 'web', web: { event: 'modal_open' } } });
  expect(result.nodeRuns['web.modal_open'].status).toBe('success');
  expect(result.nodeRuns['web.modal_close'].status).toBe('skipped');
});
