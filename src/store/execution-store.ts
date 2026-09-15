/**
 * NODEZZLE — стор выполнения: состояние схемы, журнал, outbox Telegram,
 * история выполнения. Связывает UI Canvas с чистым движком executeCanvas.
 */

import { readInlineKeyboard } from '@/core/telegram/inline-keyboard';
import { readCallback } from '@/core/telegram/callback';
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
import { executionGraphKey } from '@/lib/execution-graph-key';
import { tryParseJson } from '@/lib/utils';
import { useProjectStore } from './project-store';

export interface SimulatorPayload {
  source: 'telegram' | 'web';
  telegramEvent?: 'message' | 'callback_query';
  callbackId?: string;
  callbackData?: string;
  messageId?: number;
  text: string;
  userId: number;
  chatId: number;
  command: string;
  webJson: string;
}

export interface ExecutionHistoryRecord {
  /** Фактический источник и текст на момент запуска (не текущие поля формы). */
  source?: TriggerPayload['source'];
  telegramEvent?: 'message' | 'callback_query';
  simulatorText?: string;
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
  /** Какой записи истории принадлежат текущие результаты; null во время запуска/сброса. */
  nodeInfoRunId: string | null;
  /** Какая схема породила результат; нужен для защиты превью от устаревших данных. */
  nodeInfoGraphKey: string | null;
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
  fireWebTrigger: (web: Record<string, unknown>, targetNodeId?: string) => Promise<void>;
  fireTelegramButton: (outboxId: string, row: number, column: number) => Promise<boolean>;
  stop: () => void;
  reset: () => void;
}

let flowTimer: ReturnType<typeof setTimeout> | null = null;

const DEFAULT_PAYLOAD: SimulatorPayload = {
  source: 'telegram',
  text: 'привет',
  telegramEvent: 'message',
  callbackId: 'sim-callback-1',
  callbackData: 'confirm',
  messageId: 1,
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
        text: sim.telegramEvent === 'callback_query' ? '' : sim.text,
        user_id: sim.userId,
        chat_id: sim.chatId,
        ...(sim.telegramEvent === 'callback_query'
          ? { event: 'callback_query' as const, callback_id: sim.callbackId ?? '', data: sim.callbackData ?? '', message_id: sim.messageId }
          : sim.command.trim() !== '' ? { command: sim.command } : {}),
      },
    };
  }
  return { source: 'web', web: tryParseJson(sim.webJson, {}) as Record<string, unknown> };
}

export const useExecutionStore = create<ExecutionState>()((set, get) => {
  /** Общий запуск схемы триггерным payload (симулятор и веб-превью). */
  const startRun = async (triggerPayload: TriggerPayload, echoText: string | null): Promise<void> => {
    if (get().running) return;
    const { project, nodes, edges, groups, activeModelId } = useProjectStore.getState();
    if (!project) return;

    const graphKey = executionGraphKey(nodes, edges, project.id, activeModelId, project.models);
    const doc = flowToCanvas(nodes, edges, project.canvas.id, project.canvas.name, undefined, groups);
    const source = triggerPayload.source;
    const simulatorText = source === 'telegram'
      ? (triggerPayload.telegram?.event === 'callback_query' ? triggerPayload.telegram.data : triggerPayload.telegram?.text)
      : JSON.stringify(triggerPayload.web ?? {});
    const cancel = { cancelled: false };

    set({
      running: true,
      status: 'running',
      nodeStates: {},
      nodeInfo: {},
      nodeInfoRunId: null,
      nodeInfoGraphKey: null,
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
      source,
      ...(triggerPayload.telegram?.event ? { telegramEvent: triggerPayload.telegram.event } : {}),
      simulatorText,
      at: Date.now(),
      status: result.status,
      durationMs: result.durationMs,
      error: result.error,
    };

    set((s) => ({
      running: false,
      status: result.status,
      nodeInfo: result.nodeRuns,
      nodeInfoRunId: record.id,
      nodeInfoGraphKey: graphKey,
      history: [record, ...s.history].slice(0, 30),
      cancelRef: null,
    }));
  };

  return {
  status: 'idle',
  running: false,
  nodeStates: {},
  nodeInfo: {},
  nodeInfoRunId: null,
  nodeInfoGraphKey: null,
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
    const echo = triggerPayload.source === 'telegram' && triggerPayload.telegram?.event !== 'callback_query' ? sim.text : null;
    const nextSource = triggerPayload.source === 'web' ? 'web' : 'telegram';
    set({ payload: { ...sim, source: nextSource } });
    await startRun(triggerPayload, echo);
  },

  fireWebTrigger: async (web, targetNodeId) => {
    // Веб-превью: событие со страницы (клик, отправка формы, загрузка).
    await startRun({ source: 'web', web, ...(targetNodeId !== undefined ? { targetNodeId } : {}) }, null);
  },

  fireTelegramButton: async (outboxId, row, column) => {
    if (!canUseTelegramKeyboard(outboxId) || !Number.isInteger(row) || !Number.isInteger(column) || row < 0 || column < 0) return false;
    const message = get().outbox.find((m) => m.id === outboxId);
    if (message?.kind !== 'text') return false;
    const button = readInlineKeyboard(message.keyboard)?.inline_keyboard[row]?.[column];
    if (!button) return false;
    const payload: TriggerPayload = { source: 'telegram', telegram: {
      event: 'callback_query', text: '', callback_id: `sim-${uid()}`, data: button.callback_data,
      message_id: message.messageId, chat_id: message.chatId, user_id: get().payload.userId,
    } };
    if (!readCallback(payload)) return false;
    // startRun синхронно включает running и удаляет прежний outbox до первого await.
    await startRun(payload, null);
    return true;
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
      nodeInfoRunId: null,
      nodeInfoGraphKey: null,
      logs: [],
      outbox: [],
      chatEcho: null,
      flowEdges: [],
      cancelRef: null,
    }),
  };
});


/** Проверяется и перед рендером, и в действии: disabled — не граница доверия. */
export function canUseTelegramKeyboard(outboxId: string): boolean {
  const context = useProjectStore.getState();
  const state = useExecutionStore.getState();
  if (!context.project || state.running || state.status !== 'success' || !state.nodeInfoRunId
    || !Number.isSafeInteger(state.payload.userId) || state.payload.userId <= 0) return false;
  const key = executionGraphKey(context.nodes, context.edges, context.project.id, context.activeModelId, context.project.models);
  if (state.nodeInfoGraphKey !== key) return false;
  const message = state.outbox.find((m) => m.id === outboxId);
  return message?.kind === 'text' && Number.isSafeInteger(message.messageId) && (message.messageId ?? 0) > 0
    && Number.isSafeInteger(message.chatId) && message.chatId !== 0 && readInlineKeyboard(message.keyboard) !== null;
}
