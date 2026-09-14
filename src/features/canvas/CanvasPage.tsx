/**
 * Экран Canvas: редактор схемы проекта.
 *
 * Композиция:
 *   Toolbar (название, undo/redo, autosave, статус, Запустить/Стоп)
 *   FlowCanvas (React Flow) + BlockLibrary (слева) + ConfigPanel (справа)
 *   DebugPanel (снизу: Симулятор, Чат, Журнал, История)
 *
 * Клавиатура: Ctrl+Z / Ctrl+Shift+Z (undo/redo), Ctrl+D (дублировать),
 * Ctrl+C / Ctrl+V (копировать/вставить), Delete (удалить — встроенный в RF).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import { useParams } from 'react-router-dom';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type OnConnectStartParams,
} from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/project-store';
import { useExecutionStore } from '@/store/execution-store';
import { NodezzleNode } from './NodezzleNode';
import { BlockLibrary } from './BlockLibrary';
import { DND_MIME, decodeDnd, type DndPayload } from './library-utils';
import { ConfigPanel } from './ConfigPanel';
import { Toolbar } from './Toolbar';
import { DebugPanel } from './DebugPanel';
import { blockRegistry } from '@/core/registry/block-registry';
import { isCompatible } from '@/core/type-system/compatibility';
import { CATEGORY_COLORS } from './categoryColors';
import type { CanvasNodeData } from '@/core/project/serialize';

const nodeTypes = { nodezzle: NodezzleNode };

export function CanvasPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <ReactFlowProvider>
      <CanvasInner projectId={projectId ?? ''} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const [debugOpen, setDebugOpen] = useState(true);
  const loading = useProjectStore((s) => s.loading);
  const project = useProjectStore((s) => s.project);
  const loadById = useProjectStore((s) => s.loadById);

  useEffect(() => {
    void loadById(projectId);
  }, [projectId, loadById]);

  // Autosave: flush при переходе/закрытии и beforeunload.
  useEffect(() => {
    const handler = () => useProjectStore.getState().flushSave();
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
      useProjectStore.getState().flushSave();
    };
  }, [projectId]);

  // Сброс состояния выполнения при смене проекта.
  useEffect(() => {
    useExecutionStore.getState().reset();
  }, [projectId]);

  if (loading || !project) {
    return (
      <div className="aurora flex h-screen items-center justify-center">
        <div className="glass rounded-2xl px-8 py-6 text-sm">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-abyss">
      <Toolbar onToggleDebug={() => setDebugOpen((v) => !v)} />
      <FlowCanvas />
      <DebugPanel open={debugOpen} />
    </div>
  );
}

function FlowCanvas() {
  const { t } = useTranslation();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);
  const handleNodesChange = useProjectStore((s) => s.handleNodesChange);
  const handleEdgesChange = useProjectStore((s) => s.handleEdgesChange);
  const handleConnect = useProjectStore((s) => s.handleConnect);
  const handleDragStart = useProjectStore((s) => s.handleDragStart);
  const handleDragStop = useProjectStore((s) => s.handleDragStop);
  const setDragPort = useProjectStore((s) => s.setDragPort);
  const addNode = useProjectStore((s) => s.addNode);
  const selectNode = useProjectStore((s) => s.selectNode);
  const selectedNodeId = useProjectStore((s) => s.selectedNodeId);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const duplicateSelection = useProjectStore((s) => s.duplicateSelection);
  const copySelection = useProjectStore((s) => s.copySelection);
  const pasteAt = useProjectStore((s) => s.pasteAt);

  const flowEdges = useExecutionStore((s) => s.flowEdges);

  // Рёбра: цвет типа порта + анимация «текущих» данных во время выполнения.
  const displayEdges = useCallback(
    (list: Edge[]): Edge[] =>
      list.map((e) => ({
        ...e,
        animated: flowEdges.includes(e.id),
        style: { stroke: (e.data as { color?: string })?.color ?? '#475569', strokeWidth: 1.8 },
      })),
    [flowEdges],
  );

  // Умные соединения: запрещаем несовместимые типы INPUT/OUTPUT.
  const isValidConnection = useCallback((conn: Connection | Edge) => {
    const current = useProjectStore.getState();
    const sourceNode = current.nodes.find((n) => n.id === conn.source);
    const targetNode = current.nodes.find((n) => n.id === conn.target);
    const sourceDef = sourceNode ? blockRegistry.get(sourceNode.data.blockId) : undefined;
    const targetDef = targetNode ? blockRegistry.get(targetNode.data.blockId) : undefined;
    const sourcePort = sourceDef?.outputs.find((p) => p.id === conn.sourceHandle);
    const targetPort = targetDef?.inputs.find((p) => p.id === conn.targetHandle);
    if (!sourcePort || !targetPort) return false;
    return isCompatible(sourcePort, targetPort);
  }, []);

  const onConnectStart = useCallback((_event: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
    if (!params.nodeId || !params.handleId || !params.handleType) return;
    const { nodes: currentNodes } = useProjectStore.getState();
    const node = currentNodes.find((n) => n.id === params.nodeId);
    const def = node ? blockRegistry.get(node.data.blockId) : undefined;
    if (!def) return;
    const port = (params.handleType === 'source' ? def.outputs : def.inputs).find(
      (p) => p.id === params.handleId,
    );
      if (!port) return;
      setDragPort({
        nodeId: params.nodeId,
        portId: port.id,
        direction: params.handleType === 'source' ? 'output' : 'input',
        kind: port.kind,
        type: port.type,
      });
    },
    [setDragPort],
  );

  // --- Drag & Drop из библиотеки деталей ---
  const onDrop = useCallback(
    (event: ReactDragEvent) => {
      event.preventDefault();
      const payload = decodeDnd(event.dataTransfer.getData(DND_MIME));
      if (!payload || !wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const position = screenToFlowPosition({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      addNode(payload.blockId, position, payload.config);
    },
    [addNode, screenToFlowPosition],
  );

  const onDragOver = useCallback((event: ReactDragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Вставка из библиотеки по клику — в центр видимой области.
  const onInsertAtCenter = useCallback(
    (payload: DndPayload) => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const position = screenToFlowPosition({
        x: rect.width / 2 - 110,
        y: rect.height / 2 - 80,
      });
      addNode(payload.blockId, position, payload.config);
    },
    [addNode, screenToFlowPosition],
  );

  // --- Клавиатура ---
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      } else if (key === 'd') {
        e.preventDefault();
        duplicateSelection();
      } else if (key === 'c') {
        e.preventDefault();
        copySelection();
      } else if (key === 'v') {
        e.preventDefault();
        if (wrapperRef.current) {
          const rect = wrapperRef.current.getBoundingClientRect();
          const position = screenToFlowPosition({
            x: rect.width / 2 - 100 + Math.random() * 60,
            y: rect.height / 2 - 60 + Math.random() * 40,
          });
          pasteAt(position);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, duplicateSelection, copySelection, pasteAt, screenToFlowPosition]);

  const isEmpty = nodes.length === 0;

  return (
    <div
      ref={wrapperRef}
      className="grid-bg relative flex-1 overflow-hidden"
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <ReactFlow
        nodes={nodes}
        edges={displayEdges(edges)}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        isValidConnection={isValidConnection}
        onConnectStart={onConnectStart}
        onConnectEnd={() => setDragPort(null)}
        onNodeDragStart={handleDragStart}
        onNodeDragStop={handleDragStop}
        onNodeClick={(_e, n) => selectNode(n.id)}
        onPaneClick={() => selectNode(null)}
        fitView
        minZoom={0.15}
        maxZoom={2.2}
        deleteKeyCode={['Backspace', 'Delete']}
        selectionOnDrag
        panOnDrag
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} color="#233150" />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => {
            const data = n.data as CanvasNodeData;
            const def = blockRegistry.get(data.blockId);
            return def ? CATEGORY_COLORS[def.category] ?? '#64748b' : '#64748b';
          }}
          nodeStrokeColor="rgba(148,163,184,0.25)"
          maskColor="rgba(4,6,13,0.72)"
        />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>

      {/* Библиотека деталей (вкладки, поиск, избранное, недавние, модели) */}
      <div className="pointer-events-none absolute bottom-3 left-3 top-3 z-10">
        <BlockLibrary onInsert={onInsertAtCenter} />
      </div>

      {/* Инспектор выбранной детали */}
      {selectedNodeId && (
        <div className="pointer-events-none absolute right-3 top-3 z-10" style={{ bottom: 12 }}>
          <ConfigPanel />
        </div>
      )}

      {/* Подсказка для пустой схемы */}
      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
          <div className="glass max-w-sm rounded-2xl px-8 py-6 text-center">
            <div className="mb-2 text-3xl">🧩</div>
            <div className="mb-1 text-sm font-bold">{t('canvas.empty.title')}</div>
            <div className="text-xs leading-relaxed text-muted">{t('canvas.empty.lead')}</div>
          </div>
        </div>
      )}
    </div>
  );
}
