/** Только правила представления; определения/исполнение берутся из единого реестра. */
import type { Edge, Connection } from '@xyflow/react';
import type { NodezzleFlowNode } from '@/core/project/serialize';
import type { NodezzleProject, CanvasGroup, ProjectKind } from '@/core/project/schema';
import { blockRegistry } from '@/core/registry/block-registry';
import { checkCompatibility } from '@/core/type-system/compatibility';

export const SIMPLE_IDS = ['telegram.message_received', 'telegram.command', 'telegram.send_message', 'core.text', 'web.text'] as const;
export function isEvent(id: string) { return id === 'telegram.message_received' || id === 'telegram.command'; }
export function simpleLabelKey(id: string) { return `simple.blocks.${id.replaceAll('.', '_')}`; }
export function starterBlocks(kind: ProjectKind) {
  const ids: readonly string[] = kind === 'telegram' ? SIMPLE_IDS.slice(0, 3) : kind === 'web' ? ['web.text', 'core.text'] : ['core.text'];
  return blockRegistry.available().filter((d) => ids.includes(d.id));
}
const configKeys: Record<string, string[]> = {
  'telegram.message_received': [], 'telegram.command': ['command'],
  'telegram.send_message': ['replyText'], 'core.text': ['value'], 'web.text': ['text'],
};
export function simpleConnectionAllowed(nodes: NodezzleFlowNode[], c: Connection): boolean {
  const from = nodes.find((n) => n.id === c.source);
  const to = nodes.find((n) => n.id === c.target);
  if (!from || !to || from.id === to.id) return false;
  const output = blockRegistry.get(from.data.blockId)?.outputs.find((p) => p.id === c.sourceHandle);
  const input = blockRegistry.get(to.data.blockId)?.inputs.find((p) => p.id === c.targetHandle);
  if (!output || !input || !checkCompatibility(output, input).allowed) return false;
  if (to.data.blockId === 'telegram.send_message') {
    return (isEvent(from.data.blockId) && c.sourceHandle === 'chat_id' && c.targetHandle === 'chat_id')
      || (['telegram.message_received', 'core.text'].includes(from.data.blockId) && c.sourceHandle === 'text' && c.targetHandle === 'text');
  }
  return from.data.blockId === 'core.text' && to.data.blockId === 'web.text' && c.sourceHandle === 'text' && c.targetHandle === 'text';
}
/** Консервативно: не притворяемся, что любое дерево/модель — простая последовательность. */
export function canEditSimply(project: NodezzleProject, nodes: NodezzleFlowNode[], edges: Edge[], groups: CanvasGroup[]): boolean {
  if (project.kind === 'telegram-web' || project.meta.tutorial || project.models.length || project.variables.length || groups.length) return false;
  if (nodes.some((n) => !SIMPLE_IDS.some((id) => id === n.data.blockId)
    || !blockRegistry.available().some((d) => d.id === n.data.blockId)
    || Object.entries(n.data.config).some(([key, value]) => !configKeys[n.data.blockId]?.includes(key) || typeof value !== 'string'))) return false;
  if ((project.kind === 'web' && nodes.some((n) => n.data.blockId.startsWith('telegram.')))
    || (project.kind === 'telegram' && nodes.some((n) => n.data.blockId.startsWith('web.')))) return false;
  if (nodes.some((n) => n.data.blockId.startsWith('web.')) && nodes.some((n) => n.data.blockId.startsWith('telegram.'))) return false;
  const seen = new Set<string>();
  for (const edge of edges) {
    if (!simpleConnectionAllowed(nodes, { ...edge, sourceHandle: edge.sourceHandle ?? null, targetHandle: edge.targetHandle ?? null })) return false;
    const key = JSON.stringify([edge.target, edge.targetHandle]);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  for (const reply of nodes.filter((n) => n.data.blockId === 'telegram.send_message')) {
    const chat = edges.find((e) => e.target === reply.id && e.targetHandle === 'chat_id');
    const text = edges.find((e) => e.target === reply.id && e.targetHandle === 'text');
    const textSource = nodes.find((n) => n.id === text?.source);
    if (chat && textSource && isEvent(textSource.data.blockId) && chat.source !== textSource.id) return false;
  }
  return true;
}

export function simpleIssues(nodes: NodezzleFlowNode[], edges: Edge[]): { nodeId?: string; key: string }[] {
  const issues: { nodeId?: string; key: string }[] = [];
  const replies = nodes.filter((n) => n.data.blockId === 'telegram.send_message');
  const telegram = nodes.some((n) => n.data.blockId.startsWith('telegram.'));
  if (telegram && !replies.length) issues.push({ key: 'simple.needReply' });
  for (const n of nodes.filter((n) => n.data.blockId === 'telegram.command')) {
    if (!String(n.data.config.command ?? '').trim()) issues.push({ nodeId: n.id, key: 'simple.needCommand' });
  }
  for (const n of replies) {
    if (!edges.some((e) => e.target === n.id && e.targetHandle === 'chat_id')) issues.push({ nodeId: n.id, key: 'simple.needRecipient' });
    if (!edges.some((e) => e.target === n.id && e.targetHandle === 'text') && !String(n.data.config.replyText ?? '').trim()) issues.push({ nodeId: n.id, key: 'simple.needText' });
  }
  return issues;
}
