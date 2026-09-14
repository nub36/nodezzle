/**
 * Интеграция соединения деталей (0.5.28):
 *  - handleConnect создаёт ребро и запускает вспышку подтверждения;
 *  - состояние выполнения (execution) НЕ трогается — это разные события;
 *  - временные эффекты не попадают в сериализованный документ проекта.
 */

import '../blocks'; // регистрация всех блоков приложения

import { beforeEach, describe, expect, it } from 'vitest';
import type { CanvasDocument } from '@/core/project/schema';
import { canvasToFlow, flowToCanvas } from '@/core/project/serialize';
import type { Connection } from '@xyflow/react';
import { useProjectStore } from './project-store';
import { useExecutionStore } from './execution-store';
import { useConnectionFxStore } from './connection-fx-store';

function makeDoc(): CanvasDocument {
  return {
    id: 'canvas-1',
    name: 'Холст',
    nodes: [
      { id: 'src', blockId: 'core.text', position: { x: 0, y: 0 }, config: { value: 'привет' } },
      { id: 'n1', blockId: 'data.text_to_number', position: { x: 220, y: 0 }, config: {} },
    ],
    edges: [],
  };
}

function loadDoc() {
  const flow = canvasToFlow(makeDoc());
  useProjectStore.setState({
    project: {
      formatVersion: 1,
      id: 'proj-1',
      name: 'Проект',
      kind: 'telegram',
      canvas: makeDoc(),
      models: [],
      variables: [],
      meta: { createdAt: 1, updatedAt: 1 },
    },
    nodes: flow.nodes,
    edges: flow.edges,
    selectedNodeId: null,
    activeModelId: null,
    dragPort: null,
  });
}

describe('Соединение деталей: стор и эффекты', () => {
  beforeEach(() => {
    loadDoc();
    useExecutionStore.getState().reset();
    useConnectionFxStore.getState().resetConnectionFx();
  });

  it('handleConnect создаёт ребро и вспышку подтверждения с данными концов', () => {
    const connection: Connection = {
      source: 'src',
      sourceHandle: 'text',
      target: 'n1',
      targetHandle: 'value',
    };
    useProjectStore.getState().handleConnect(connection);

    const { edges } = useProjectStore.getState();
    expect(edges).toHaveLength(1);
    const edge = edges[0];
    expect(edge.source).toBe('src');
    expect(edge.target).toBe('n1');
    expect(edge.sourceHandle).toBe('text');
    expect(edge.targetHandle).toBe('value');

    const fx = useConnectionFxStore.getState().success;
    expect(fx).not.toBeNull();
    expect(fx?.edgeId).toBe(edge.id);
    expect(fx?.sourceNodeId).toBe('src');
    expect(fx?.targetNodeId).toBe('n1');
  });

  it('соединение НЕ является выполнением: состояния исполнения не меняются', () => {
    useProjectStore.getState().handleConnect({
      source: 'src',
      sourceHandle: 'text',
      target: 'n1',
      targetHandle: 'value',
    });
    const execution = useExecutionStore.getState();
    expect(execution.nodeStates).toEqual({});
    expect(execution.flowEdges).toEqual([]);
  });

  it('временные эффекты не сохраняются в документе проекта', () => {
    useProjectStore.getState().handleConnect({
      source: 'src',
      sourceHandle: 'text',
      target: 'n1',
      targetHandle: 'value',
    });
    const { nodes, edges } = useProjectStore.getState();
    const doc = flowToCanvas(nodes, edges, 'canvas-1', 'Холст');
    const serialized = JSON.stringify(doc);
    // Никаких транзиентных полей визуального слоя в данных проекта.
    expect(serialized).not.toContain('isGlowing');
    expect(serialized).not.toContain('justConnected');
    expect(serialized).not.toContain('animationTime');
    expect(serialized).not.toContain('connect-success');
    // Ребро сохраняется в каноническом формате (порты обоих концов).
    expect(doc.edges).toEqual([
      { id: edges[0].id, source: 'src', sourcePort: 'text', target: 'n1', targetPort: 'value' },
    ]);
  });

  it('dragPort — состояние перетаскивания — тоже вне документа', () => {
    useProjectStore.getState().setDragPort({
      nodeId: 'src',
      portId: 'text',
      direction: 'output',
      kind: 'data',
      type: 'text',
    });
    const { nodes, edges } = useProjectStore.getState();
    const doc = flowToCanvas(nodes, edges, 'canvas-1', 'Холст');
    expect(JSON.stringify(doc)).not.toContain('dragPort');
  });
});
