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
import type { DebugPanelTab } from '@/lib/debug-tabs';
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
  /** Активная вкладка панели отладки (нужна в т.ч. Академии, подэтап 5.11). */
  panelTab: DebugPanelTab;

  setPanelTab: (tab: DebugPanelTab) => void;
  setPayload: (patch: Partial<SimulatorPayload>) => void;
  run: () => Promise<void>;
  /** Запуск схемы веб-событием из превью страницы (Этап 2, подэтап I ч. 2). */
  fireWebTrigger: (web: Record<string, unknown>) => Promise<void>;
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

/**
 * Чистая сборка триггерного payload по настройкам симулятора и составу
 * схемы: если на холсте триггеры только одного источника, он побеждает
 * (симулятор не может «угадать» несуществующий источник).
 */
export function buildTriggerPayload(
  sim: SimulatorPayload,
  triggerCategories: Array<string | undefined>,
): TriggerPayload {
  const hasTelegram = triggerCategories.some((c) => typeof c === 'string' && c.startsWith('telegram'));
  const hasWeb = triggerCategories.some((c) => typeof c === 'string' && c.startsWith('web'));
  let source: 'telegram' | 'web' = sim.source;
  if (hasTelegram && !hasWeb) source = 'telegram';
  else if (hasWeb && !hasTelegram) source = 'web';

  if (source === 'telegram') {
    return {
      source: 'telegram',
      telegram: {
        text: sim.text,
        user_id: sim.userId,
        chat_id: sim.chatId,
        ...(sim.command.trim() !== '' ? { command: sim.command } : {}),
      },
    };
  }
  return { source: 'web', web: tryParseJson(sim.webJson, {}) as Record<string, unknown> };
}

export const useExecutionStore = create<ExecutionState>()((set, get) => {
  /** Общий запуск схемы триггерным payload (симулятор и веб-превью). */
  const startRun = async (triggerPayload: TriggerPayload, echoText: string | null): Promise<void> => {
    if (get().running) return;
    const { project, nodes, edges, groups } = useProjectStore.getState();
    if (!project) return;

    const doc = flowToCanvas(nodes, edges, project.canvas.id, project.canvas.name, undefined, groups);
    const cancel = { cancelled: false };

    set({
      running: true,
      status: 'running',
      nodeStates: {},
      nodeInfo: {},
      logs: [],
      outbox: [],
      flowEdges: [],
      chatEcho: echoText,
      cancelRef: cancel,
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
  };

  return {
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
  panelTab: 'simulator',

  setPanelTab: (tab) => set({ panelTab: tab }),
  cancelRef: null,

  setPayload: (patch) => set((s) => ({ payload: { ...s.payload, ...patch } })),

  run: async () => {
    const { nodes } = useProjectStore.getState();
    const sim = get().payload;
    const triggerCategories = nodes
      .map((n) => blockRegistry.get(n.data.blockId))
      .filter((d) => d && (d.trigger === true || d.entry === true))
      .map((d) => d!.category);
    const triggerPayload = buildTriggerPayload(sim, triggerCategories);
    const echo = triggerPayload.source === 'telegram' ? sim.text : null;
    const nextSource = triggerPayload.source === 'web' ? 'web' : 'telegram';
    set({ payload: { ...sim, source: nextSource } });
    await startRun(triggerPayload, echo);
  },

  fireWebTrigger: async (web) => {
    // Веб-превью: событие со страницы (клик, отправка формы, загрузка).
    await startRun({ source: 'web', web }, null);
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
  };
});
