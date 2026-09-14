/**
 * NODEZZLE — мост между форматом хранилища (CanvasDocument)
 * и форматом React Flow (nodes/edges на Canvas).
 *
 * Формат хранилища стабилен и не содержит UI-состояния;
 * React Flow-узлы — производная структура для рендеринга.
 */

import type { Edge, Node } from '@xyflow/react';
import type { CanvasDocument, CanvasEdge, CanvasNode } from './schema';

/** Данные React Flow-узла NODEZZLE.
 * (type alias, а не interface — чтобы тип оставался совместим с
 * Record<string, unknown> из React Flow через implicit index signature). */
export type CanvasNodeData = {
  blockId: string;
  config: Record<string, unknown>;
  label?: string;
};

export type NodezzleFlowNode = Node<CanvasNodeData, 'nodezzle'>;

/** Данные React Flow-ребра (цвет типа портов и т.п.). */
export interface CanvasEdgeData {
  color?: string;
}

/** CanvasDocument → React Flow (nodes, edges). */
export function canvasToFlow(doc: CanvasDocument): { nodes: NodezzleFlowNode[]; edges: Edge[] } {
  const nodes: NodezzleFlowNode[] = doc.nodes.map((n) => canvasNodeToFlowNode(n));
  const edges: Edge[] = doc.edges.map(canvasEdgeToFlowEdge);
  return { nodes, edges };
}

export function canvasNodeToFlowNode(n: CanvasNode): NodezzleFlowNode {
  return {
    id: n.id,
    type: 'nodezzle',
    position: { x: n.position.x, y: n.position.y },
    data: {
      blockId: n.blockId,
      config: { ...(n.config ?? {}) },
      ...(n.label !== undefined ? { label: n.label } : {}),
    },
  };
}

export function canvasEdgeToFlowEdge(e: CanvasEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    sourceHandle: e.sourcePort,
    target: e.target,
    targetHandle: e.targetPort,
    type: 'default',
  };
}

/** React Flow (nodes, edges) → CanvasDocument (формат хранилища). */
export function flowToCanvas(
  nodes: NodezzleFlowNode[],
  edges: Edge[],
  id: string,
  name: string,
  viewport?: CanvasDocument['viewport'],
  groups?: CanvasDocument['groups'],
): CanvasDocument {
  const canvasNodes: CanvasNode[] = nodes.map((n) => ({
    id: n.id,
    blockId: n.data.blockId,
    ...(n.data.label !== undefined ? { label: n.data.label } : {}),
    position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    config: { ...(n.data.config ?? {}) },
  }));
  const canvasEdges: CanvasEdge[] = edges
    .filter((e) => e.sourceHandle && e.targetHandle)
    .map((e) => ({
      id: e.id,
      source: e.source,
      sourcePort: e.sourceHandle as string,
      target: e.target,
      targetPort: e.targetHandle as string,
    }));
  return {
    id,
    name,
    nodes: canvasNodes,
    edges: canvasEdges,
    ...(viewport ? { viewport } : {}),
    // Группы (рамки) — опциональное поле формата (Этап 2, подэтап F ч. 2).
    ...(groups && groups.length > 0 ? { groups } : {}),
  };
}
