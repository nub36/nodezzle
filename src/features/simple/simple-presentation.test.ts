import { describe, expect, it } from 'vitest';
import '@/blocks';
import { canEditSimply, simpleConnectionAllowed, simpleIssues, starterBlocks } from './simple-presentation';
import { canvasToFlow } from '@/core/project/serialize';
import type { NodezzleProject } from '@/core/project/schema';
const project = (): NodezzleProject => ({ formatVersion: 1, id: 'project', name: 'Старый проект', kind: 'telegram',
  canvas: { id: 'canvas', name: 'Схема', nodes: [
    { id: 'event', blockId: 'telegram.message_received', position: { x: 12, y: 43 }, config: {} },
    { id: 'reply', blockId: 'telegram.send_message', position: { x: 340, y: 43 }, config: { replyText: 'Привет!' } },
  ], edges: [{ id: 'edge', source: 'event', sourcePort: 'chat_id', target: 'reply', targetPort: 'chat_id' }] },
  models: [], variables: [], meta: { createdAt: 1, updatedAt: 1 } });
describe('простое представление общего графа', () => {
  it('отбирает реально доступные детали по намерению, не меняя реестр', () => {
    expect(starterBlocks('telegram').map((d) => d.id)).toEqual(['telegram.message_received', 'telegram.command', 'telegram.send_message']);
    expect(starterBlocks('web').map((d) => d.id).sort()).toEqual(['core.text', 'web.text']);
    expect(starterBlocks('empty').map((d) => d.id)).toEqual(['core.text']);
  });
  it('поддерживает фиксированный ответ и старое эхо без преобразования', () => {
    const p = project(); const f = canvasToFlow(p.canvas); const before = JSON.stringify(f);
    expect(canEditSimply(p, f.nodes, f.edges, [])).toBe(true);
    expect(JSON.stringify(f)).toBe(before);
    f.nodes[1]!.data.config = {};
    f.edges.push({ id: 'text', source: 'event', sourceHandle: 'text', target: 'reply', targetHandle: 'text' });
    expect(canEditSimply(p, f.nodes, f.edges, [])).toBe(true);
    expect(simpleIssues(f.nodes, f.edges)).toEqual([]);
  });
  it('не разрешает неверный порт или два источника одного входа', () => {
    const p = project(); const f = canvasToFlow(p.canvas);
    expect(simpleConnectionAllowed(f.nodes, { source: 'event', sourceHandle: 'text', target: 'reply', targetHandle: 'chat_id' })).toBe(false);
    f.edges.push({ ...f.edges[0]!, id: 'duplicate' });
    expect(canEditSimply(p, f.nodes, f.edges, [])).toBe(false);
  });
  it('не выдаёт расширенные конфигурации, блоки и группы за простую схему', () => {
    for (const mutation of [
      (p: NodezzleProject) => { p.canvas.nodes[1]!.blockId = 'logic.condition'; },
      (p: NodezzleProject) => { p.canvas.nodes[1]!.blockId = 'future.unknown'; },
      (p: NodezzleProject) => { p.canvas.nodes[1]!.config = { replyText: 'Текст', future: { retained: true } }; },
      (p: NodezzleProject) => { p.canvas.groups = [{ id: 'g', label: 'Группа', nodeIds: ['reply'] }]; },
      (p: NodezzleProject) => { p.kind = 'telegram-web'; },
      (p: NodezzleProject) => { p.kind = 'web'; },
    ]) {
      const p = project(); mutation(p); const f = canvasToFlow(p.canvas); const before = JSON.stringify({ p, f });
      expect(canEditSimply(p, f.nodes, f.edges, p.canvas.groups ?? [])).toBe(false);
      expect(JSON.stringify({ p, f })).toBe(before);
    }
  });
  it('не смешивает получателя и текст разных событий', () => {
    const p = project(); const f = canvasToFlow(p.canvas);
    f.nodes.push({ ...f.nodes[0]!, id: 'other' });
    f.edges.push({ id: 'text', source: 'other', sourceHandle: 'text', target: 'reply', targetHandle: 'text' });
    expect(canEditSimply(p, f.nodes, f.edges, [])).toBe(false);
  });
  it('объясняет отсутствие текста, получателя и ответа', () => {
    const p = project(); const f = canvasToFlow(p.canvas); f.nodes[1]!.data.config = {};
    expect(simpleIssues(f.nodes, []).map((i) => i.key)).toEqual(['simple.needRecipient', 'simple.needText']);
    expect(simpleIssues([f.nodes[0]!], []).map((i) => i.key)).toEqual(['simple.needReply']);
  });
});
