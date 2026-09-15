/** Корни отображения по зависимостям children; не меняет граф и правила runtime. */
import { isWebField } from '@/core/web/field-element';
import type { Edge } from '@xyflow/react';
import type { NodezzleFlowNode } from '@/core/project/serialize';
import { blockRegistry } from '@/core/registry/block-registry';

export const isWebLayout = (id: string) => ['web.container', 'web.section', 'web.grid', 'web.modal'].includes(id);
export const isWebUrlBlock = (id: string) => id === 'web.image' || id === 'web.link';
export const isWebRenderable = (id: string) => id === 'web.text' || id === 'web.heading' || isWebUrlBlock(id) || isWebField(id) || isWebLayout(id);

export function webLayoutRoots(nodes: NodezzleFlowNode[], edges: Edge[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, Edge[]>();
  for (const edge of edges) {
    const node = byId.get(edge.target);
    const input = node && blockRegistry.get(node.data.blockId)?.inputs.find((p) => p.id === edge.targetHandle);
    if (input?.kind !== 'data') continue;
    const list = incoming.get(edge.target) ?? [];
    list.push(edge);
    incoming.set(edge.target, list);
  }
  const consumed = new Set<string>();
  let hasCycle = false;
  for (const parent of nodes.filter((n) => isWebLayout(n.data.blockId))) {
    const queue = (incoming.get(parent.id) ?? []).filter((e) => e.targetHandle === 'children').map((e) => e.source);
    const visited = new Set<string>();
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      if (id === parent.id) { hasCycle = true; consumed.add(id); continue; }
      if (visited.has(id)) continue;
      visited.add(id);
      const source = byId.get(id);
      if (!source) continue;
      if (isWebRenderable(source.data.blockId)) consumed.add(id);
      for (const edge of incoming.get(id) ?? []) queue.push(edge.source);
    }
  }
  return { roots: nodes.filter((n) => isWebRenderable(n.data.blockId) && !consumed.has(n.id)), hasCycle };
}
