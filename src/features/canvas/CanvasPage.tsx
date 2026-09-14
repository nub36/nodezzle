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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  DND_MIME,
  decodeDnd,
  nodeMatchesQuery,
  quickInsertCandidates,
  type DndPayload,
  type QuickInsertCandidate,
} from './library-utils';
import { QuickInsertMenu, QuickInsertStarter } from './QuickInsert';
import { CanvasContextMenu, type ContextMenuItem } from './ContextMenu';
import { useUiStore } from '@/store/ui-store';
import { InspectorPanel } from './InspectorPanel';
import { Toolbar } from './Toolbar';
import { CreateModelDialog } from './CreateModelDialog';
import { DebugPanel } from './DebugPanel';
import { blockRegistry } from '@/core/registry/block-registry';
import { isCompatible } from '@/core/type-system/compatibility';
import { CATEGORY_COLORS } from './categoryColors';
import type { CanvasNodeData } from '@/core/project/serialize';
import type { DragPortInfo } from '@/store/project-store';

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
  const selectEdge = useProjectStore((s) => s.selectEdge);
  const selectedNodeId = useProjectStore((s) => s.selectedNodeId);
  const duplicateSelection = useProjectStore((s) => s.duplicateSelection);
  const copySelection = useProjectStore((s) => s.copySelection);
  const deleteSelection = useProjectStore((s) => s.deleteSelection);
  const disconnectNode = useProjectStore((s) => s.disconnectNode);
  const addNote = useProjectStore((s) => s.addNote);
  const activeModelId = useProjectStore((s) => s.activeModelId);
  const openModel = useProjectStore((s) => s.openModel);
  const closeModel = useProjectStore((s) => s.closeModel);
  const project = useProjectStore((s) => s.project);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const pasteAt = useProjectStore((s) => s.pasteAt);

  const flowEdges = useExecutionStore((s) => s.flowEdges);
  const effectsEnabled = useUiStore((s) => s.effectsEnabled);
  const schemaQuery = useUiStore((s) => s.schemaQuery);

  // Рёбра: цвет типа порта + анимация «текущих» данных во время выполнения.
  // Переключатель эффектов (тулбар) отключает анимацию.
  const displayEdges = useCallback(
    (list: Edge[]): Edge[] =>
      list.map((e) => ({
        ...e,
        animated: effectsEnabled && flowEdges.includes(e.id),
        style: { stroke: (e.data as { color?: string })?.color ?? '#475569', strokeWidth: 1.8 },
      })),
    [flowEdges, effectsEnabled],
  );

  // Поиск по схеме (тулбар): неподходящие узлы приглушаются.
  // Drill Down (Этап 2, подэтап H): при смене уровня сбрасываем выполнение.
  useEffect(() => {
    useExecutionStore.getState().reset();
  }, [activeModelId]);

  // Быстрая вставка: меню открывается, если соединение от порта
  // отпущено на пустом месте (без подключения к другому порту).
  const [quickInsert, setQuickInsert] = useState<{ x: number; y: number; port: DragPortInfo } | null>(null);
  const connectFired = useRef(false);

  // --- Контекстное меню (Этап 2, подэтап F) ---
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null);
  // Диалог создания модели из выделенного (Этап 2, подэтап G)
  const [createModelOpen, setCreateModelOpen] = useState(false);

  const ctxItems = useMemo<ContextMenuItem[]>(() => {
    if (!ctxMenu) return [];
    const noteAt = () => addNote(screenToFlowPosition({ x: ctxMenu.x, y: ctxMenu.y }));
    if (!ctxMenu.nodeId) {
      return [{ label: t('canvas.context.addNote'), icon: '📝', onClick: noteAt }];
    }
    const nodeId = ctxMenu.nodeId;
    const downEdge = edges.find((e) => e.source === nodeId);
    const upEdge = edges.find((e) => e.target === nodeId);
    return [
      {
        label: t('canvas.context.duplicate'),
        icon: '⧉',
        onClick: () => {
          selectNode(nodeId);
          duplicateSelection();
        },
      },
      {
        label: t('canvas.context.copy'),
        icon: '📋',
        onClick: () => {
          selectNode(nodeId);
          copySelection();
        },
      },
      {
        label: t('canvas.context.disconnect'),
        icon: '⚡',
        disabled: !downEdge && !upEdge,
        onClick: () => disconnectNode(nodeId),
      },
      {
        label: t('canvas.context.followDown'),
        icon: '→',
        disabled: !downEdge,
        onClick: () => downEdge && selectNode(downEdge.target),
      },
      {
        label: t('canvas.context.followUp'),
        icon: '←',
        disabled: !upEdge,
        onClick: () => upEdge && selectNode(upEdge.source),
      },
      { divider: true, label: '', onClick: () => undefined },
      { label: t('canvas.context.addNote'), icon: '📝', onClick: noteAt },
      { label: t('canvas.context.createModel'), icon: '📦', onClick: () => setCreateModelOpen(true) },
      {
        label: t('canvas.context.delete'),
        icon: '🗑',
        danger: true,
        onClick: () => {
          selectNode(nodeId);
          deleteSelection();
        },
      },
    ];
  }, [ctxMenu, edges, t, addNote, selectNode, duplicateSelection, copySelection, disconnectNode, deleteSelection, screenToFlowPosition]);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: { id: string }) => {
      event.preventDefault();
      if (!wrapperRef.current) return;
      selectNode(node.id);
      const rect = wrapperRef.current.getBoundingClientRect();
      setCtxMenu({
        x: Math.min(event.clientX - rect.left, Math.max(rect.width - 230, 8)),
        y: Math.min(event.clientY - rect.top, Math.max(rect.height - 260, 8)),
        nodeId: node.id,
      });
    },
    [selectNode],
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      setCtxMenu({
        x: Math.min(event.clientX - rect.left, Math.max(rect.width - 230, 8)),
        y: Math.min(event.clientY - rect.top, Math.max(rect.height - 100, 8)),
        nodeId: null,
      });
    },
    [],
  );

  const quickCandidates = useMemo(
    () => (quickInsert ? quickInsertCandidates(blockRegistry.available(), quickInsert.port) : []),
    [quickInsert],
  );

  const handleConnectTracked = useCallback(
    (connection: Connection) => {
      connectFired.current = true;
      handleConnect(connection);
    },
    [handleConnect],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const port = useProjectStore.getState().dragPort;
      setDragPort(null);
      const fired = connectFired.current;
      connectFired.current = false;
      if (fired || !port || !wrapperRef.current) return;
      const point =
        'clientX' in event
          ? { x: event.clientX, y: event.clientY }
          : { x: event.changedTouches[0]?.clientX ?? 0, y: event.changedTouches[0]?.clientY ?? 0 };
      const rect = wrapperRef.current.getBoundingClientRect();
      // Меню не должно вылезать за пределы холста.
      const x = Math.min(Math.max(point.x - rect.left, 8), Math.max(rect.width - 256, 8));
      const y = Math.min(Math.max(point.y - rect.top, 8), Math.max(rect.height - 320, 8));
      setQuickInsert({ x, y, port });
    },
    [setDragPort],
  );

  // Выбор детали из меню: создать рядом и автоматически подключить.
  const handleQuickPick = useCallback(
    (candidate: QuickInsertCandidate) => {
      if (!quickInsert) return;
      const flowPos = screenToFlowPosition({ x: quickInsert.x, y: quickInsert.y });
      const newId = addNode(candidate.def.id, { x: flowPos.x + 30, y: flowPos.y - 20 });
      if (newId) {
        const port = quickInsert.port;
        const connection: Connection =
          port.direction === 'output'
            ? { source: port.nodeId, sourceHandle: port.portId, target: newId, targetHandle: candidate.port.id }
            : { source: newId, sourceHandle: candidate.port.id, target: port.nodeId, targetHandle: port.portId };
        handleConnect(connection);
      }
      setQuickInsert(null);
    },
    [quickInsert, addNode, handleConnect, screenToFlowPosition],
  );

  const focusMode = useUiStore((s) => s.focusMode);
  const displayNodes = useMemo(() => {
    const q = schemaQuery.trim();
    if (q !== '') {
      return nodes.map((n) =>
        nodeMatchesQuery(n, q, (blockId) => {
          const def = blockRegistry.get(blockId);
          return def ? t(def.labelKey) : '';
        })
          ? n
          : { ...n, style: { ...n.style, opacity: 0.3 } },
      );
    }
    // Режим фокуса (Этап 2, подэтап F): приглушается всё, кроме выбранной
    // детали и её непосредственных связей.
    if (focusMode && selectedNodeId) {
      const keep = new Set<string>([selectedNodeId]);
      for (const e of edges) {
        if (e.source === selectedNodeId) keep.add(e.target);
        if (e.target === selectedNodeId) keep.add(e.source);
      }
      return nodes.map((n) => (keep.has(n.id) ? n : { ...n, style: { ...n.style, opacity: 0.22 } }));
    }
    return nodes;
  }, [nodes, edges, schemaQuery, focusMode, selectedNodeId, t]);

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
      {/* Хлебные крошки (Этап 2, подэтап H) */}
      {activeModelId && project && (
        <div className="glass pointer-events-auto absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px]">
          <button className="font-semibold text-cyan-300 transition-colors hover:text-cyan-100" onClick={closeModel}>
            {t('canvas.breadcrumb.project')}
          </button>
          <span className="text-muted">›</span>
          <span className="text-muted">{t('canvas.breadcrumb.models')}</span>
          <span className="text-muted">›</span>
          <span className="font-semibold">
            {project.models.find((m) => m.id === activeModelId)?.name ?? '?'}
          </span>
        </div>
      )}
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges(edges)}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnectTracked}
        isValidConnection={isValidConnection}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeDragStart={handleDragStart}
        onNodeDragStop={handleDragStop}
        onNodeClick={(_e, n) => selectNode(n.id)}
        onNodeDoubleClick={(_e, n) => {
          const data = n.data as CanvasNodeData;
          if (data.blockId === 'models.call') {
            const modelId = String(data.config?.modelId ?? '');
            if (modelId) openModel(modelId);
          }
        }}
        onEdgeClick={(_e, edge) => selectEdge(edge.id)}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={() => {
          selectNode(null);
          setQuickInsert(null);
          setCtxMenu(null);
        }}
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

      {/* Контекстный инспектор: деталь / соединение / холст (Этап 2, подэтап E) */}
      <div className="pointer-events-none absolute right-3 top-3 z-10" style={{ bottom: 12 }}>
        <InspectorPanel />
      </div>

      {/* Быстрая вставка на пустой схеме */}
      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
          <QuickInsertStarter onInsert={onInsertAtCenter} />
        </div>
      )}

      {/* Контекстное меню (Этап 2, подэтап F) */}
      {ctxMenu && (
        <CanvasContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems} onClose={() => setCtxMenu(null)} />
      )}

      {/* Быстрая вставка от порта (только совместимые детали) */}
      {quickInsert && (
        <QuickInsertMenu
          candidates={quickCandidates}
          x={quickInsert.x}
          y={quickInsert.y}
          onPick={handleQuickPick}
          onClose={() => setQuickInsert(null)}
        />
      )}

      {/* Диалог «Создать модель из выделенного» (Этап 2, подэтап G) */}
      {createModelOpen && <CreateModelDialog onClose={() => setCreateModelOpen(false)} />}
    </div>
  );
}
