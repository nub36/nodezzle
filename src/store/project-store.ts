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

  const serializeAndSave = async () => {
    const { project, nodes, edges } = get();
    if (!project) return;
    try {
      const updated: NodezzleProject = {
        ...project,
        canvas: flowToCanvas(nodes, edges, project.canvas.id, project.canvas.name),
        meta: { ...project.meta, updatedAt: Date.now() },
      };
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
      });
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

    selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

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
      const { project, nodes, edges } = get();
      if (!project) return;
      const updated: NodezzleProject = {
        ...project,
        canvas: flowToCanvas(nodes, edges, project.canvas.id, project.canvas.name),
        meta: { ...project.meta, updatedAt: Date.now() },
      };
      void projectStorage.save(updated);
    },

    touch: () => scheduleSave(),
  };
});
