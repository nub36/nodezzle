import '@/blocks';
import { afterEach, expect, it } from 'vitest';
import { novicePath } from './novice-model';
import { LIBRARY_GROUPS, libraryGroup, migrateCollapsedCategories } from '@/lib/library-groups';
import { BLOCK_CATEGORIES } from '@/core/types/blocks';
import { useUiStore } from '@/store/ui-store';
import { useProjectStore } from '@/store/project-store';
import { useExecutionStore } from '@/store/execution-store';
import { createDemoProject } from '@/demo/seed';
import { executionGraphKey } from '@/lib/execution-graph-key';
import type { NodezzleFlowNode } from '@/core/project/serialize';
const node = (id: string, blockId: string, config = {}): NodezzleFlowNode => ({ id, type: 'nodezzle', position: { x: 0, y: 0 }, data: { blockId, config } });
const pair = [node('a', 'telegram.message_received'), node('b', 'telegram.send_message')];
const edges = ['text', 'chat_id'].map((port) => ({ id: port, source: 'a', target: 'b', sourceHandle: port, targetHandle: port }));
afterEach(() => { useExecutionStore.getState().reset(); });
it('каждая исходная категория имеет ровно одну верхнюю группу', () => {
  expect(BLOCK_CATEGORIES.every((c) => (LIBRARY_GROUPS as readonly string[]).includes(libraryGroup(c)))).toBe(true);
});
it('миграция сохраняет раскрытые группы, не стирая настройки опытного пользователя', () => {
  expect(migrateCollapsedCategories([])).toEqual([]);
  expect(migrateCollapsedCategories(['telegram_events'])).not.toContain('telegram');
  expect(migrateCollapsedCategories(['telegram_events', 'telegram_actions'])).toContain('telegram');
  expect(migrateCollapsedCategories([...BLOCK_CATEGORIES])).toEqual([...LIBRARY_GROUPS]);
});
it('первое открытие: группы закрыты, отладка закрыта, подсказки включены', () => {
  const s = useUiStore.getInitialState();
  expect(s.collapsedCategories).toEqual([...LIBRARY_GROUPS]);
  expect(s.debugOpen).toBe(false);
  expect(s.noviceMode).toBe(true);
});
it('панели сворачиваются независимо от выбранной детали', () => {
  useProjectStore.setState({ selectedNodeId: 'selected' });
  const ui = useUiStore.getState();
  ui.setSideCollapsed('library', true); ui.setSideCollapsed('inspector', false);
  expect(useUiStore.getState().libraryCollapsed).toBe(true);
  expect(useUiStore.getState().inspectorCollapsed).toBe(false);
  expect(useProjectStore.getState().selectedNodeId).toBe('selected');
});
it('начало и действие определяются по реальным деталям', () => {
  expect(novicePath([], []).step).toBe(0);
  expect(novicePath(pair.slice(0, 1), []).step).toBe(1);
  expect(novicePath(pair, []).step).toBe(2);
});
it('для ответа нужны и текст, и получатель; частичная связь не завершает проверку', () => {
  expect(novicePath(pair, edges.slice(0, 1)).missing).toEqual([['chat_id', 'chat_id']]);
  expect(novicePath(pair, edges).step).toBe(3);
  expect(novicePath(pair, edges).missing).toEqual([]);
});
it('помощник не заменяет пользовательский источник и не добавляет дубли', () => {
  expect(novicePath(pair, [{ ...edges[0], source: 'other' }]).safe).toBe(false);
  expect(novicePath(pair, edges).missing).toHaveLength(0);
});
it('для веб-текста нужен один провод с правильным направлением', () => {
  const web = [node('a', 'core.text'), node('b', 'web.text')];
  expect(novicePath(web, [edges[0]]).step).toBe(3);
  expect(novicePath(web, [{ ...edges[0], source: 'b', target: 'a' }]).step).toBe(2);
});
it('настоящий запуск Telegram отдаёт ответ указанному тестовому получателю', async () => {
  const project = { ...createDemoProject(), models: [] };
  useProjectStore.setState({ project, nodes: pair, edges, activeModelId: null });
  useExecutionStore.getState().setPayload({ source: 'telegram', telegramEvent: 'message', text: 'Первый ответ 42', chatId: 42 });
  await useExecutionStore.getState().run();
  const result = useExecutionStore.getState();
  expect(result.status).toBe('success');
  expect(result.outbox).toEqual([expect.objectContaining({ text: 'Первый ответ 42', chatId: 42 })]);
  expect(result.nodeInfoGraphKey).toBe(executionGraphKey(pair, edges, project.id, null, []));
  expect(result.nodeInfoGraphKey).not.toBe(executionGraphKey(pair, [], project.id, null, []));
});
it('настоящий Web-запуск создаёт элемент с переданным текстом, не фальшивый статус', async () => {
  const nodes = [node('a', 'core.text', { value: 'Моя страница' }), node('b', 'web.text')];
  useProjectStore.setState({ project: { ...createDemoProject(), models: [] }, nodes, edges: [edges[0]], activeModelId: null });
  await useExecutionStore.getState().run();
  const result = useExecutionStore.getState();
  expect(result.status).toBe('success');
  expect(result.nodeInfo.b.outputs?.element).toEqual(expect.objectContaining({ text: 'Моя страница' }));
});
