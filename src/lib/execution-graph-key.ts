/** Снимок данных выполнения, без позиции/выделения/измерений узлов. Не сохраняется на диск. */
import type { Edge } from '@xyflow/react';
import type { NodezzleFlowNode } from '@/core/project/serialize';
import type { StoredModel } from '@/core/project/schema';
export function executionGraphKey(nodes: NodezzleFlowNode[], edges: Edge[], projectId: string, activeModelId: string | null, models: StoredModel[]): string {
  return JSON.stringify({ projectId, activeModelId, models,
    nodes: nodes.map((n) => ({ id: n.id, blockId: n.data.blockId, config: n.data.config })),
    edges: edges.map((e) => ({ source: e.source, sourcePort: e.sourceHandle, target: e.target, targetPort: e.targetHandle })),
  });
}
