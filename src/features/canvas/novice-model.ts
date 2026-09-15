import type { NodezzleFlowNode } from '@/core/project/serialize';
import type { Edge } from '@xyflow/react';
export function novicePath(nodes: NodezzleFlowNode[], edges: Edge[]) {
  const start = nodes.find((n) => n.data.blockId === 'telegram.message_received') ?? nodes.find((n) => n.data.blockId === 'core.text');
  const telegram = start?.data.blockId === 'telegram.message_received';
  const action = nodes.find((n) => n.data.blockId === (telegram ? 'telegram.send_message' : 'web.text'));
  const pairs = telegram ? [['text', 'text'], ['chat_id', 'chat_id']] : [['text', 'text']];
  const missing = start && action ? pairs.filter(([source, target]) => !edges.some((e) => e.source === start.id && e.target === action.id && e.sourceHandle === source && e.targetHandle === target)) : pairs;
  // Не заменять уже подключённый пользовательский источник.
  const safe = !!start && !!action && missing.every(([, target]) => !edges.some((e) => e.target === action.id && e.targetHandle === target));
  return { start, action, telegram, missing, safe, step: !start ? 0 : !action ? 1 : missing.length ? 2 : 3 };
}
