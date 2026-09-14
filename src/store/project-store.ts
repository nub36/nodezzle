/**
 * NODEZZLE — стор проекта: документ, canvas-состояние, undo/redo, autosave.
 *
 * Autosave: любое изменение → debounce 900 мс → ProjectStorage.
 * Flush при закрытии вкладки (beforeunload) — синхронный setItem.
 * История версий (версионированные снапшоты) — следующий этап ROADMAP.
 */

import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';
import i18n from 'i18next';
import { create } from 'zustand';
import { projectStorage } from '@/core/project/storage';
import { canvasToFlow, flowToCanvas, type CanvasNodeData } from '@/core/project/serialize';
import type { NodezzleProject, ProjectKind, ProjectSummary } from '@/core/project/schema';
import { blockRegistry } from '@/core/registry/block-registry';
import { portColor } from '@/core/type-system/compatibility';
import type { PortKind, PortType } from '@/core/types/ports';
import { uid } from '@/lib/id';
import { useUiStore } from '@/store/ui-store';
import { extractModel } from '@/core/models/extract';
import { createDemoProject, DEMO_PROJECT_ID } from '@/demo/seed';
import type { NodezzleFlowNode } from '@/core/project/serialize';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface DragPortInfo {
  nodeId: string;
  portId: string;
  direction: 'input' | 'output';
  kind: PortKind;
  type: PortType;
}

interface Snapshot {
  nodes: NodezzleFlowNode[];
  edges: Edge[];
}

interface ClipboardData {
  nodes: NodezzleFlowNode[];
  edges: Edge[];
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let clipboard: ClipboardData | null = null;
let dragStartSnapshot: Snapshot | null = null;

const clone = <T,>(value: T): T =>
  typeof structuredClone === 'function' ? structuredClone(value) : (JSON.parse(JSON.stringify(value)) as T);

const snapshotOf = (nodes: NodezzleFlowNode[], edges: Edge[]): Snapshot => ({
  nodes: clone(nodes),
  edges: clone(edges),
});

const snapshotsEqual = (a: Snapshot, b: Snapshot): boolean =>
  JSON.stringify(a.nodes) === JSON.stringify(b.nodes) && JSON.stringify(a.edges) === JSON.stringify(b.edges);

interface ProjectState {
  project: NodezzleProject | null;
  loading: boolean;
  saveState: SaveState;
  savedAt: number | null;

  nodes: NodezzleFlowNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  /** Порт, который перетаскивают для соединения (подсветка совместимых). */
  dragPort: DragPortInfo | null;

  past: Snapshot[];
  future: Snapshot[];

  loadById: (id: string) => Promise<void>;
  /** Открытый уровень: null — холст проекта, иначе — внутренний холст модели (Этап 2, подэтап H). */
  activeModelId: string | null;
  openModel: (modelId: string) => void;
  closeModel: () => void;
  createProject: (kind: ProjectKind) => Promise<NodezzleProject>;
  seedDemo: () => Promise<NodezzleProject>;
  listProjects: () => Promise<ProjectSummary[]>;
  deleteProject: (id: string) => Promise<void>;

  renameProject: (name: string) => void;
  /** Возвращает id созданного узла (или undefined, если блок/проект недоступны). */
  addNode: (blockId: string, position: { x: number; y: number }, configOverrides?: Record<string, unknown>) => string | undefined;
  duplicateSelection: () => void;
  copySelection: () => void;
  pasteAt: (position: { x: number; y: number }) => void;
  handleNodesChange: OnNodesChange<NodezzleFlowNode>;
  handleEdgesChange: OnEdgesChange;
  handleConnect: (connection: Connection) => void;
  handleDragStart: (event: MouseEvent | TouchEvent, node: NodezzleFlowNode) => void;
  handleDragStop: () => void;
  setDragPort: (info: DragPortInfo | null) => void;
  selectNode: (nodeId: string | null) => void;
  /** Выделение соединения (Этап 2, подэтап E — инспектор соединения). */
  selectEdge: (edgeId: string | null) => void;
  /** Удаление соединения (с попаданием в историю undo/redo). */
  deleteEdge: (edgeId: string) => void;
  /** Удаление выбранных узлов и их соединений (с историей). */
  deleteSelection: () => void;
  /** Вставка стикера-заметки на холст (Этап 2, подэтап F). */
  addNote: (position: { x: number; y: number }) => void;
  /** Текст заметки (для стикеров). */
  setNoteText: (nodeId: string, text: string) => void;
  /** Отключить узел: удалить все подходя к нему соединения. */
  disconnectNode: (nodeId: string) => void;
  /**
   * Создать модель из выделенных деталей (Этап 2, подэтап G).
   * Возвращает код ошибки либо `null` при успехе.
   */
  createModelFromSelection: (name: string) => string | null;
  setNodeConfig: (nodeId: string, key: string, value: unknown) => void;
  setNodeLabel: (nodeId: string, label: string) => void;
  undo: () => void;
  redo: () => void;
  saveNow: () => Promise<void>;
  /** Синхронный flush для beforeunload. */
  flushSave: () => void;
  touch: () => void;
}

export const useProjectStore = create<ProjectState>()((set, get) => {
  const scheduleSave = () => {
    set({ saveState: 'saving' });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void get().saveNow();
    }, 900);
  };

  const commit = (before: Snapshot) => {
    const { past } = get();
    const last = past[past.length - 1];
    if (last && snapshotsEqual(last, before)) return;
    set({ past: [...past.slice(-99), before], future: [] });
    scheduleSave();
  };

  /**
   * Записать текущие узлы/рёбра в активный документ: холст проекта либо
   * внутренний холст модели (Drill Down, Этап 2 подэтап H).
   */
  const withActiveCanvas = (
    project: NodezzleProject,
    activeModelId: string | null,
    nodes: NodezzleFlowNode[],
    edges: Edge[],
  ): NodezzleProject => {
    if (activeModelId) {
      return {
        ...project,
        models: project.models.map((m) =>
          m.id === activeModelId
            ? { ...m, canvas: flowToCanvas(nodes, edges, m.canvas.id, m.canvas.name), updatedAt: Date.now() }
            : m,
        ),
        meta: { ...project.meta, updatedAt: Date.now() },
      };
    }
    return {
      ...project,
      canvas: flowToCanvas(nodes, edges, project.canvas.id, project.canvas.name),
      meta: { ...project.meta, updatedAt: Date.now() },
    };
  };

  const serializeAndSave = async () => {
    const { project, nodes, edges, activeModelId } = get();
    if (!project) return;
    try {
      const updated = withActiveCanvas(project, activeModelId, nodes, edges);
      await projectStorage.save(updated);
      set({ project: updated, saveState: 'saved', savedAt: updated.meta.updatedAt });
    } catch {
      set({ saveState: 'error' });
    }
  };

  return {
    project: null,
    loading: false,
    saveState: 'idle',
    savedAt: null,
    nodes: [],
    edges: [],
    activeModelId: null,
    selectedNodeId: null,
    dragPort: null,
    past: [],
    future: [],

    loadById: async (id) => {
      set({ loading: true });
      const project = await projectStorage.get(id);
      if (!project) {
        set({ loading: false });
        return;
      }
      const { nodes, edges } = canvasToFlow(project.canvas);
      set({
        project,
        nodes,
        edges,
        past: [],
        future: [],
        loading: false,
        saveState: 'saved',
        savedAt: project.meta.updatedAt,
        selectedNodeId: null,
        activeModelId: null,
      });
    },

    openModel: (modelId) => {
      const { project, nodes, edges, activeModelId } = get();
      if (!project || activeModelId === modelId) return;
      const model = project.models.find((m) => m.id === modelId);
      if (!model) return;
      // Сначала сохраняем текущий документ (холст проекта или другую модель).
      const written = withActiveCanvas(project, activeModelId, nodes, edges);
      const inner = canvasToFlow(model.canvas);
      set({
        project: written,
        activeModelId: modelId,
        nodes: inner.nodes,
        edges: inner.edges,
        past: [],
        future: [],
        selectedNodeId: null,
      });
      scheduleSave();
    },

    closeModel: () => {
      const { project, nodes, edges, activeModelId } = get();
      if (!project || activeModelId === null) return;
      const written = withActiveCanvas(project, activeModelId, nodes, edges);
      const outer = canvasToFlow(written.canvas);
      set({
        project: written,
        activeModelId: null,
        nodes: outer.nodes,
        edges: outer.edges,
        past: [],
        future: [],
        selectedNodeId: null,
      });
      scheduleSave();
    },

    createProject: async (kind) => {
      const now = Date.now();
      const list = await projectStorage.list();
      const count = list.filter((p) => p.kind === kind).length + 1;
      const name = `${i18n.t(`dashboard.names.${kind}`)} ${count}`;
      const project: NodezzleProject = {
        formatVersion: 1,
        id: uid(),
        name,
        kind,
        canvas: { id: uid(), name: i18n.t('dashboard.defaultCanvasName'), nodes: [], edges: [] },
        models: [],
        variables: [],
        meta: { createdAt: now, updatedAt: now },
      };
      await projectStorage.save(project);
      return project;
    },

    seedDemo: async () => {
      const existing = await projectStorage.get(DEMO_PROJECT_ID);
      if (existing) return existing;
      const project = createDemoProject();
      await projectStorage.save(project);
      return project;
    },

    listProjects: () => projectStorage.list(),

    deleteProject: async (id) => {
      await projectStorage.remove(id);
    },

    renameProject: (name) => {
      const { project } = get();
      if (!project || project.name === name) return;
      set({ project: { ...project, name } });
      scheduleSave();
    },

    addNode: (blockId, position, configOverrides) => {
      const { project, nodes } = get();
      const def = blockRegistry.get(blockId);
      if (!project || !def) return undefined;
      const config = { ...clone(def.defaults ?? {}), ...clone(configOverrides ?? {}) };
      // Удобство: единственный проект-модель подставляется в «Вызов модели».
      if (blockId === 'models.call' && !config.modelId && project.models.length === 1) {
        config.modelId = project.models[0].id;
      }
      const before = snapshotOf(nodes, get().edges);
      const node: NodezzleFlowNode = {
        id: uid(),
        type: 'nodezzle',
        position,
        data: { blockId, config },
        selected: true,
      };
      set({
        nodes: [...nodes.map((n) => ({ ...n, selected: false })), node],
        selectedNodeId: node.id,
      });
      commit(before);
      // Библиотека: записываем деталь в «Недавние» (сохраняется в браузере).
      useUiStore.getState().recordRecent(blockId);
      return node.id;
    },

    duplicateSelection: () => {
      const { nodes, edges } = get();
      const selected = nodes.filter((n) => n.selected);
      if (selected.length === 0) return;
      const selectedIds = new Set(selected.map((n) => n.id));
      const before = snapshotOf(nodes, edges);
      const idMap = new Map<string, string>();
      for (const n of selected) idMap.set(n.id, uid());
      const newNodes: NodezzleFlowNode[] = selected.map((n) => ({
        ...clone(n),
        id: idMap.get(n.id)!,
        position: { x: n.position.x + 36, y: n.position.y + 36 },
        selected: true,
      }));
      const newEdges: Edge[] = edges
        .filter((e) => selectedIds.has(e.source) && selectedIds.has(e.target))
        .map((e) => ({
          ...clone(e),
          id: uid(),
          source: idMap.get(e.source)!,
          target: idMap.get(e.target)!,
        }));
      set({
        nodes: [...nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
        edges: [...edges, ...newEdges],
        selectedNodeId: newNodes[0]?.id ?? null,
      });
      commit(before);
    },

    copySelection: () => {
      const { nodes, edges } = get();
      const selected = nodes.filter((n) => n.selected);
      if (selected.length === 0) return;
      const selectedIds = new Set(selected.map((n) => n.id));
      clipboard = {
        nodes: clone(selected),
        edges: edges.filter((e) => selectedIds.has(e.source) && selectedIds.has(e.target)),
      };
    },

    pasteAt: (position) => {
      const { nodes, edges } = get();
      if (!clipboard || clipboard.nodes.length === 0) return;
      const minX = Math.min(...clipboard.nodes.map((n) => n.position.x));
      const minY = Math.min(...clipboard.nodes.map((n) => n.position.y));
      const offset = { x: position.x - minX, y: position.y - minY };
      const before = snapshotOf(nodes, edges);
      const idMap = new Map<string, string>();
      for (const n of clipboard.nodes) idMap.set(n.id, uid());
      const newNodes: NodezzleFlowNode[] = clipboard.nodes.map((n) => ({
        ...clone(n),
        id: idMap.get(n.id)!,
        position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
        selected: true,
      }));
      const newEdges: Edge[] = clipboard.edges.map((e) => ({
        ...clone(e),
        id: uid(),
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
      }));
      set({
        nodes: [...nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
        edges: [...edges, ...newEdges],
        selectedNodeId: newNodes[0]?.id ?? null,
      });
      commit(before);
    },

    handleNodesChange: (changes) => {
      const before = snapshotOf(get().nodes, get().edges);
      const hasRemove = changes.some((c) => c.type === 'remove');
      set({ nodes: applyNodeChanges(changes, get().nodes) });
      if (hasRemove) {
        const remaining = new Set(get().nodes.map((n) => n.id));
        const currentSelected = get().selectedNodeId;
        const selected = currentSelected !== null && remaining.has(currentSelected) ? currentSelected : null;
        set({ selectedNodeId: selected });
        commit(before);
      }
    },

    handleEdgesChange: (changes) => {
      const hasRemove = changes.some((c) => c.type === 'remove');
      if (!hasRemove) {
        set({ edges: applyEdgeChanges(changes, get().edges) });
        return;
      }
      const before = snapshotOf(get().nodes, get().edges);
      set({ edges: applyEdgeChanges(changes, get().edges) });
      commit(before);
    },

    handleConnect: (connection) => {
      const { nodes, edges } = get();
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const def = sourceNode ? blockRegistry.get(sourceNode.data.blockId) : undefined;
      const port = def?.outputs.find((p) => p.id === connection.sourceHandle);
      const color = port ? portColor(port.type) : '#64748b';
      const before = snapshotOf(nodes, edges);
      const edge: Edge = {
        id: uid(),
        source: connection.source,
        sourceHandle: connection.sourceHandle ?? undefined,
        target: connection.target,
        targetHandle: connection.targetHandle ?? undefined,
        type: 'default',
        data: { color },
      };
      set({ edges: [...edges, edge] });
      commit(before);
    },

    handleDragStart: (_event, _node) => {
      const { nodes, edges } = get();
      dragStartSnapshot = snapshotOf(nodes, edges);
    },

    handleDragStop: () => {
      if (!dragStartSnapshot) return;
      const before = dragStartSnapshot;
      dragStartSnapshot = null;
      commit(before);
    },

    setDragPort: (info) => set({ dragPort: info }),

    selectNode: (nodeId) =>
      set((state) => ({
        selectedNodeId: nodeId,
        // Выделение узлов и рёбер — взаимоисключающие (для инспектора).
        edges: state.edges.some((e) => e.selected)
          ? state.edges.map((e) => ({ ...e, selected: false }))
          : state.edges,
      })),

    selectEdge: (edgeId) =>
      set((state) => ({
        selectedNodeId: null,
        edges: state.edges.map((e) => ({ ...e, selected: e.id === edgeId })),
      })),

    deleteSelection: () => {
      const { nodes, edges } = get();
      const selected = nodes.filter((n) => n.selected);
      if (selected.length === 0) return;
      const ids = new Set(selected.map((n) => n.id));
      const before = snapshotOf(nodes, edges);
      set({
        nodes: nodes.filter((n) => !ids.has(n.id)),
        edges: edges.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
        selectedNodeId: null,
      });
      commit(before);
    },

    addNote: (position) => {
      const { project, nodes } = get();
      if (!project) return;
      const before = snapshotOf(nodes, get().edges);
      const node: NodezzleFlowNode = {
        id: uid(),
        type: 'nodezzle',
        position,
        data: { blockId: 'note.sticky', config: { text: '' } },
        selected: true,
      };
      set({
        nodes: [...nodes.map((n) => ({ ...n, selected: false })), node],
        selectedNodeId: node.id,
      });
      commit(before);
    },

    setNoteText: (nodeId, text) => {
      const { nodes, edges } = get();
      const before = snapshotOf(nodes, edges);
      set({
        nodes: nodes.map((n) => {
          if (n.id !== nodeId) return n;
          const data = n.data as CanvasNodeData;
          return { ...n, data: { ...data, config: { ...(data.config ?? {}), text } } };
        }),
      });
      commit(before);
    },

    createModelFromSelection: (name) => {
      const { project, nodes, edges, activeModelId } = get();
      if (!project) return 'ERR_MODEL_EXTRACT_EMPTY';
      const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);

      const activeDoc = activeModelId
        ? project.models.find((m) => m.id === activeModelId)?.canvas
        : project.canvas;
      if (!activeDoc) return 'ERR_MODEL_EXTRACT_EMPTY';

      const doc = flowToCanvas(nodes, edges, activeDoc.id, activeDoc.name, activeDoc.viewport);
      const result = extractModel({
        canvas: doc,
        selectedNodeIds: selectedIds,
        modelName: name,
        getBlock: (id) => blockRegistry.get(id),
        portName: (labelKey, fallback) => i18n.t(labelKey, fallback),
      });
      if (!result.ok) return result.error;

      const before = snapshotOf(nodes, edges);
      const flow = canvasToFlow(result.value.canvas);
      // Цвета рёбер по типу порта источника (как в `handleConnect`).
      const coloredEdges = flow.edges.map((e) => {
        const sourceNode = flow.nodes.find((n) => n.id === e.source);
        const def = sourceNode ? blockRegistry.get(sourceNode.data.blockId) : undefined;
        const port = def?.outputs.find((p) => p.id === e.sourceHandle);
        return { ...e, data: { color: port ? portColor(port.type) : '#475569' } };
      });

      const updatedProject: NodezzleProject = {
        ...project,
        models: [...project.models, result.value.model],
        meta: { ...project.meta, updatedAt: Date.now() },
      };
      const finalProject = activeModelId
        ? {
            ...updatedProject,
            models: updatedProject.models.map((m) =>
              m.id === activeModelId ? { ...m, canvas: result.value.canvas, updatedAt: Date.now() } : m,
            ),
          }
        : { ...updatedProject, canvas: result.value.canvas };

      set({
        project: finalProject,
        nodes: flow.nodes.map((n) => ({ ...n, selected: n.id === result.value.callNodeId })),
        edges: coloredEdges,
        selectedNodeId: result.value.callNodeId,
      });
      commit(before);
      return null;
    },

    disconnectNode: (nodeId) => {
      const { nodes, edges } = get();
      if (!edges.some((e) => e.source === nodeId || e.target === nodeId)) return;
      const before = snapshotOf(nodes, edges);
      set({ edges: edges.filter((e) => e.source !== nodeId && e.target !== nodeId) });
      commit(before);
    },

    deleteEdge: (edgeId) => {
      const { nodes, edges } = get();
      if (!edges.some((e) => e.id === edgeId)) return;
      const before = snapshotOf(nodes, edges);
      set({ edges: edges.filter((e) => e.id !== edgeId) });
      commit(before);
    },

    setNodeConfig: (nodeId, key, value) => {
      const { nodes, edges } = get();
      const before = snapshotOf(nodes, edges);
      set({
        nodes: nodes.map((n) => {
          if (n.id !== nodeId) return n;
          const data = n.data as CanvasNodeData;
          return { ...n, data: { ...data, config: { ...(data.config ?? {}), [key]: value } } };
        }),
      });
      commit(before);
    },

    setNodeLabel: (nodeId, label) => {
      const { nodes, edges } = get();
      const before = snapshotOf(nodes, edges);
      set({
        nodes: nodes.map((n) => {
          if (n.id !== nodeId) return n;
          const data = n.data as CanvasNodeData;
          const next: CanvasNodeData = { ...data };
          if (label === '') delete next.label;
          else next.label = label;
          return { ...n, data: next };
        }),
      });
      commit(before);
    },

    undo: () => {
      const { past, future, nodes, edges } = get();
      const prev = past[past.length - 1];
      if (!prev) return;
      const current = snapshotOf(nodes, edges);
      set({
        nodes: prev.nodes,
        edges: prev.edges,
        past: past.slice(0, -1),
        future: [...future, current].slice(-100),
        selectedNodeId: null,
      });
      scheduleSave();
    },

    redo: () => {
      const { past, future, nodes, edges } = get();
      const next = future[future.length - 1];
      if (!next) return;
      const current = snapshotOf(nodes, edges);
      set({
        nodes: next.nodes,
        edges: next.edges,
        future: future.slice(0, -1),
        past: [...past, current].slice(-100),
        selectedNodeId: null,
      });
      scheduleSave();
    },

    saveNow: async () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      set({ saveState: 'saving' });
      await serializeAndSave();
    },

    flushSave: () => {
      const { project, nodes, edges, activeModelId } = get();
      if (!project) return;
      const updated = withActiveCanvas(project, activeModelId, nodes, edges);
      void projectStorage.save(updated);
    },

    touch: () => scheduleSave(),
  };
});
