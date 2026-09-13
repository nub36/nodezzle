/**
 * NODEZZLE — стор выполнения: состояние схемы, журнал, outbox Telegram,
 * история выполнения. Связывает UI Canvas с чистым движком executeCanvas.
 */

import { create } from 'zustand';
import { executeCanvas } from '@/core/runtime/execute';
import { flowToCanvas } from '@/core/project/serialize';
import { blockRegistry } from '@/core/registry/block-registry';
import type {
  ExecutionStatus,
  LogEntry,
  NodeExecutionStatus,
  NodeRunInfo,
  TelegramOutMessage,
  TriggerPayload,
} from '@/core/types/runtime';
import { uid } from '@/lib/id';
import { tryParseJson } from '@/lib/utils';
import { useProjectStore } from './project-store';

export interface SimulatorPayload {
  source: 'telegram' | 'web';
  text: string;
  userId: number;
  chatId: number;
  command: string;
  webJson: string;
}

export interface ExecutionHistoryRecord {
  id: string;
  at: number;
  status: ExecutionStatus;
  durationMs: number;
  error?: string;
}

interface ExecutionState {
  status: ExecutionStatus;
  running: boolean;
  nodeStates: Record<string, NodeExecutionStatus>;
  nodeInfo: Record<string, NodeRunInfo>;
  logs: LogEntry[];
  outbox: TelegramOutMessage[];
  /** Эхо пользовательского сообщения симулятора (для демо-чата). */
  chatEcho: string | null;
  /** Соединения, по которым «текут» данные (анимация). */
  flowEdges: string[];
  history: ExecutionHistoryRecord[];
  payload: SimulatorPayload;
  cancelRef: { cancelled: boolean } | null;

  setPayload: (patch: Partial<SimulatorPayload>) => void;
  run: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

let flowTimer: ReturnType<typeof setTimeout> | null = null;

const DEFAULT_PAYLOAD: SimulatorPayload = {
  source: 'telegram',
  text: 'привет',
  userId: 42,
  chatId: 1000,
  command: '',
  webJson: '{}',
};

export const useExecutionStore = create<ExecutionState>()((set, get) => ({
  status: 'idle',
  running: false,
  nodeStates: {},
  nodeInfo: {},
  logs: [],
  outbox: [],
  chatEcho: null,
  flowEdges: [],
  history: [],
  payload: { ...DEFAULT_PAYLOAD },
  cancelRef: null,

  setPayload: (patch) => set((s) => ({ payload: { ...s.payload, ...patch } })),

  run: async () => {
    if (get().running) return;
    const { project, nodes, edges } = useProjectStore.getState();
    if (!project) return;

    // Определяем источник по триггерам, лежащим на схеме.
    const sim = get().payload;
    const triggerDefs = nodes
      .map((n) => blockRegistry.get(n.data.blockId))
      .filter((d) => d && (d.trigger === true || d.entry === true));
    const hasTelegram = triggerDefs.some((d) => d!.category === 'telegram');
    const hasWeb = triggerDefs.some((d) => d!.category === 'web');
    let source: 'telegram' | 'web' = sim.source;
    if (hasTelegram && !hasWeb) source = 'telegram';
    else if (hasWeb && !hasTelegram) source = 'web';

    let triggerPayload: TriggerPayload;
    if (source === 'telegram') {
      triggerPayload = {
        source: 'telegram',
        telegram: {
          text: sim.text,
          user_id: sim.userId,
          chat_id: sim.chatId,
          ...(sim.command.trim() !== '' ? { command: sim.command } : {}),
        },
      };
    } else {
      triggerPayload = { source: 'web', web: tryParseJson(sim.webJson, {}) as Record<string, unknown> };
    }

    const doc = flowToCanvas(nodes, edges, project.canvas.id, project.canvas.name);
    const cancel = { cancelled: false };

    set({
      running: true,
      status: 'running',
      nodeStates: {},
      nodeInfo: {},
      logs: [],
      outbox: [],
      flowEdges: [],
      chatEcho: source === 'telegram' ? sim.text : null,
      cancelRef: cancel,
      payload: { ...sim, source },
    });

    const result = await executeCanvas(doc, {
      payload: triggerPayload,
      registry: blockRegistry,
      models: Object.fromEntries(project.models.map((m) => [m.id, m])),
      cancel,
      onNodeState: (nodeId, status) =>
        set((s) => ({ nodeStates: { ...s.nodeStates, [nodeId]: status } })),
      onEdgeFlow: (edgeId) =>
        set((s) => (s.flowEdges.includes(edgeId) ? s : { flowEdges: [...s.flowEdges, edgeId] })),
      onLog: (entry) => set((s) => ({ logs: [...s.logs, entry] })),
      onOutbox: (msg) => set((s) => ({ outbox: [...s.outbox, msg] })),
    });

    if (flowTimer) clearTimeout(flowTimer);
    flowTimer = setTimeout(() => set({ flowEdges: [] }), 1800);

    const record: ExecutionHistoryRecord = {
      id: uid(),
      at: Date.now(),
      status: result.status,
      durationMs: result.durationMs,
      error: result.error,
    };

    set((s) => ({
      running: false,
      status: result.status,
      nodeInfo: result.nodeRuns,
      history: [record, ...s.history].slice(0, 30),
      cancelRef: null,
    }));
  },

  stop: () => {
    const ref = get().cancelRef;
    if (ref) ref.cancelled = true;
  },

  reset: () =>
    set({
      status: 'idle',
      running: false,
      nodeStates: {},
      nodeInfo: {},
      logs: [],
      outbox: [],
      chatEcho: null,
      flowEdges: [],
      cancelRef: null,
    }),
}));
