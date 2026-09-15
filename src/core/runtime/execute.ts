/**
 * NODEZZLE — движок живого выполнения схем.
 *
 * Чистый TypeScript без зависимости от React:
 *  - триггеры (Telegram/Web) и entry-блоки моделей стартуют схему по TriggerPayload;
 *  - «холодные» источники (блоки без СОЕДИНЁННЫХ входов) выполняются on-demand,
 *    когда их значение впервые нужно выполняющемуся соседу (pull);
 *  - data-соединения: узел запускается, когда все его connected-входы удовлетворимы;
 *  - event-соединения пересылают сигнал, error-соединения — ошибку;
 *  - защита от циклов (бюджет шагов + лимит исполнений узла);
 *  - отмена (STOPPED) и полная телеметрия для Debug UI.
 *
 * Состояния: IDLE → WAITING → RUNNING → SUCCESS | ERROR | STOPPED.
 */

import type { BlockRegistry } from '../registry/block-registry';
import { blockRegistry } from '../registry/block-registry';
import type { CanvasDocument, StoredModel } from '../project/schema';
import { uid } from '../../lib/id';
import type {
  ExecutionResult,
  LogEntry,
  LogLevel,
  NodeExecutionStatus,
  NodeRunInfo,
  RuntimeContext,
  TelegramOutMessage,
  TriggerPayload,
} from '../types/runtime';

export interface ExecuteOptions {
  /** Payload запуска (симмулятор / Telegram / Web). */
  payload?: TriggerPayload;
  /** Реестр блоков (по умолчанию — глобальный). */
  registry?: BlockRegistry;
  /** Модели проекта для блока «Вызов модели». */
  models?: Record<string, StoredModel>;
  onNodeState?: (nodeId: string, status: NodeExecutionStatus) => void;
  /** Соединение «пропустило данные» (для анимации частиц в UI). */
  onEdgeFlow?: (edgeId: string) => void;
  onLog?: (entry: LogEntry) => void;
  onOutbox?: (msg: TelegramOutMessage) => void;
  cancel?: { cancelled: boolean };
  /** Внутреннее: инъекция полей контекста (используется executeModel). */
  contextOverrides?: Partial<Pick<RuntimeContext, 'modelOutputs' | 'executeModel'>>;
}

const MAX_NODE_EXECUTIONS = 25;
const MAX_TOTAL_STEPS = 500;

interface InLink {
  edgeId: string;
  source: string;
  sourcePort: string;
}

interface OutLink {
  edgeId: string;
  sourcePort: string;
  target: string;
  targetPort: string;
  kind: 'data' | 'event' | 'error';
}

/** Контроль завершения: отмена/цикл из рекурсивных вызовов. */
class ExecutionAbort extends Error {
  readonly status: ExecutionResult['status'];
  readonly code?: string;

  constructor(status: ExecutionResult['status'], code?: string) {
    super(code ?? status);
    this.status = status;
    this.code = code;
  }
}

/** Ожидание с поддержкой отмены (для блока «Задержка»). */
export async function sleepWithCancel(ms: number, cancel: { cancelled: boolean }): Promise<void> {
  const step = 25;
  let waited = 0;
  while (waited < ms) {
    if (cancel.cancelled) throw new Error('ERR_CANCELLED');
    await new Promise((resolve) => setTimeout(resolve, step));
    waited += step;
  }
  if (cancel.cancelled) throw new Error('ERR_CANCELLED');
}

export async function executeCanvas(
  doc: CanvasDocument,
  options: ExecuteOptions = {},
): Promise<ExecutionResult> {
  const registry = options.registry ?? blockRegistry;
  const startedAt = Date.now();
  const cancel = options.cancel ?? { cancelled: false };
  const payload: TriggerPayload = options.payload ?? { source: 'generic' };

  const logs: LogEntry[] = [];
  const outbox: TelegramOutMessage[] = [];
  const nodeRuns: Record<string, NodeRunInfo> = {};

  const pushLog = (level: LogLevel, message: string, data?: unknown) => {
    const entry: LogEntry = { id: uid(), at: Date.now(), level, message, data };
    logs.push(entry);
    options.onLog?.(entry);
  };

  // --- Контекст выполнения (telegram — симуляция через outbox) ---
  const runtime: RuntimeContext = {
    payload,
    cancel,
    log: pushLog,
    telegram: {
      answerCallback: async (answer) => {
        const msg: TelegramOutMessage = { id: uid(), at: Date.now(), kind: 'callback_answer', ...answer };
        outbox.push(msg);
        options.onOutbox?.(msg);
        return true; // Поставлено в outbox; не подтверждение доставки Telegram.
      },
      send: async (m) => {
        const messageId = 9001 + outbox.length;
        const msg: TelegramOutMessage = { id: uid(), chatId: m.chatId, kind: 'text', text: m.text, at: Date.now(), messageId, ...(m.keyboard ? { keyboard: m.keyboard } : {}) };
        outbox.push(msg);
        options.onOutbox?.(msg);
        return messageId;
      },
      sendPhoto: async (m) => {
        const msg: TelegramOutMessage = {
          id: uid(),
          chatId: m.chatId,
          kind: 'photo',
          text: m.caption ?? '',
          at: Date.now(),
        };
        outbox.push(msg);
        options.onOutbox?.(msg);
        return 9000 + outbox.length;
      },
    },
    models: options.models,
    modelOutputs: {},
    memory: new Map(),
    executeModel: async (modelId, inputs) => {
      const model = options.models?.[modelId];
      if (!model) throw new Error('ERR_MODEL_NOT_FOUND');
      const innerOutputs: Record<string, unknown> = {};
      const innerResult = await executeCanvas(model.canvas, {
        registry,
        models: options.models,
        payload: { source: 'model', model: { inputs } },
        cancel,
        onNodeState: undefined,
        onEdgeFlow: undefined,
        onLog: (e) => {
          logs.push(e);
          options.onLog?.(e);
        },
        onOutbox: (m) => {
          outbox.push(m);
          options.onOutbox?.(m);
        },
        contextOverrides: {
          modelOutputs: innerOutputs,
          executeModel: runtime.executeModel,
        },
      });
      // Ошибка/ожидание вложенной схемы не превращаются в успешный пустой result.
      if (innerResult.status !== 'success') {
        throw new Error(innerResult.error ?? 'ERR_MODEL_EXECUTION');
      }
      return innerOutputs;
    },
    ...options.contextOverrides,
  };

  const finish = (status: ExecutionResult['status'], error?: string): ExecutionResult => {
    let finalStatus = status;
    let finalError = error;
    if (finalStatus !== 'error' && finalStatus !== 'stopped') {
      const failed = Object.values(nodeRuns).some((r) => r.status === 'error');
      if (failed) {
        finalStatus = 'error';
        finalError = finalError ?? 'ERR_NODE_FAILED';
      }
    }
    return { status: finalStatus, error: finalError, nodeRuns, logs, outbox, durationMs: Date.now() - startedAt };
  };

  // --- Валидация документа ---
  if (doc.nodes.length === 0) return finish('error', 'ERR_EMPTY_CANVAS');

  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]));
  for (const n of doc.nodes) {
    if (!registry.get(n.blockId)) return finish('error', 'ERR_BLOCK_NOT_FOUND');
  }
  const edgeKeys = new Set<string>();
  for (const e of doc.edges) {
    const key = `${e.source}:${e.sourcePort}:${e.target}:${e.targetPort}`;
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) return finish('error', 'ERR_BLOCK_NOT_FOUND');
    if (edgeKeys.has(key)) return finish('error', 'ERR_DUPLICATE_EDGE');
    edgeKeys.add(key);
  }

  const defOf = (nodeId: string) => registry.get(nodeById.get(nodeId)!.blockId)!;

  // --- Индексы соединений ---
  const inByNode = new Map<string, InLink[]>();
  const inByPort = new Map<string, InLink[]>(); // `${nodeId}:${portId}`
  const outByNode = new Map<string, OutLink[]>();
  for (const e of doc.edges) {
    const kind = defOf(e.source).outputs.find((p) => p.id === e.sourcePort)?.kind ?? 'data';
    const link: InLink = { edgeId: e.id, source: e.source, sourcePort: e.sourcePort };
    const inNode = inByNode.get(e.target) ?? [];
    inNode.push(link);
    inByNode.set(e.target, inNode);
    const key = `${e.target}:${e.targetPort}`;
    const inPort = inByPort.get(key) ?? [];
    inPort.push(link);
    inByPort.set(key, inPort);
    const outList = outByNode.get(e.source) ?? [];
    outList.push({ edgeId: e.id, sourcePort: e.sourcePort, target: e.target, targetPort: e.targetPort, kind });
    outByNode.set(e.source, outList);
  }

  /** Есть ли у узла хотя бы один СОЕДИНЁННЫЙ вход. */
  const hasWiredInput = (nodeId: string): boolean => (inByNode.get(nodeId) ?? []).length > 0;

  /** «Холодный» источник: блок без соединённых входов (константа, триггер…). */
  const isColdSource = (nodeId: string): boolean => !hasWiredInput(nodeId);

  // --- Точки входа: триггеры и entry-блоки ---
  const matchedIds = new Set<string>();
  const hasAnyEntry = doc.nodes.some((n) => {
    const def = defOf(n.id);
    return def.trigger === true || def.entry === true;
  });
  const state = (nodeId: string): NodeRunInfo => {
    let run = nodeRuns[nodeId];
    if (!run) {
      run = { status: 'idle', inputs: {}, outputs: {}, durationMs: 0, startedAt: startedAt, executions: 0 };
      nodeRuns[nodeId] = run;
    }
    return run;
  };
  const state0 = (nodeId: string, status: NodeExecutionStatus) => {
    state(nodeId).status = status;
    options.onNodeState?.(nodeId, status);
  };

  for (const n of doc.nodes) {
    const def = defOf(n.id);
    if (def.trigger !== true && def.entry !== true) continue;
    if ((payload.targetNodeId !== undefined && payload.targetNodeId !== n.id) ||
        (def.matches && !def.matches(payload, n.config ?? {}))) {
      state0(n.id, 'skipped');
      continue;
    }
    matchedIds.add(n.id);
  }

  // --- Данные выполнения ---
  const delivered = new Map<string, Record<string, unknown>>();
  const started = new Set<string>();
  let steps = 0;

  /** Можно ли выполнить узел как pull-источник прямо сейчас. */
  const pullable = (nodeId: string): boolean => {
    if (started.has(nodeId)) return true;
    if (!isColdSource(nodeId)) return false;
    const def = defOf(nodeId);
    // Триггер/entry, не сработавший на payload, pull-ом не запускается.
    if ((def.trigger === true || def.entry === true) && !matchedIds.has(nodeId)) return false;
    return true;
  };

  /** Узел готов, когда каждый connected data-вход: доставлен ИЛИ pull-источник. */
  const isSatisfiable = (nodeId: string): boolean => {
    const def = defOf(nodeId);
    const have = delivered.get(nodeId) ?? {};
    for (const p of def.inputs) {
      if (p.kind !== 'data') continue;
      const inc = inByPort.get(`${nodeId}:${p.id}`) ?? [];
      if (inc.length === 0) continue;
      if (p.id in have) continue;
      if (!inc.some((l) => pullable(l.source))) return false;
    }
    return true;
  };

  const queue: string[] = [];
  const queued = new Set<string>();
  const enqueue = (nodeId: string) => {
    if (queued.has(nodeId) || started.has(nodeId) || !nodeById.has(nodeId)) return;
    queued.add(nodeId);
    queue.push(nodeId);
  };

  // --- Bootstrap: кто начинает схему ---
  if (hasAnyEntry || payload.targetNodeId !== undefined) {
    if (matchedIds.size === 0) {
      pushLog('warn', 'ERR_NO_TRIGGER');
      return finish('waiting', 'ERR_NO_TRIGGER');
    }
    for (const id of matchedIds) enqueue(id);
  } else {
    for (const n of doc.nodes) {
      if (isColdSource(n.id) && pullable(n.id)) enqueue(n.id);
    }
    if (queue.length === 0) {
      // Узлы есть, но все имеют соединённые входы → цикл.
      return finish('error', 'ERR_CYCLE');
    }
  }

  // --- Выполнение узла (рекурсивно: pull холодных источников) ---
  const runNode = async (nodeId: string): Promise<void> => {
    if (cancel.cancelled) throw new ExecutionAbort('stopped', 'ERR_CANCELLED');
    if (++steps > MAX_TOTAL_STEPS) throw new ExecutionAbort('error', 'ERR_CYCLE');

    const node = nodeById.get(nodeId);
    if (!node) return;
    const def = defOf(nodeId);

    if (started.has(nodeId)) {
      if (isColdSource(nodeId)) return; // статический источник уже выполнен
      // Повторный запуск по event/error-сигналу — дальше, с новым inputs.
    }

    // 1) Pull: выполняем ещё не запущенные холодные источники входов.
    for (const p of def.inputs) {
      if (p.kind !== 'data') continue;
      const have = delivered.get(nodeId) ?? {};
      if (p.id in have) continue;
      for (const link of inByPort.get(`${nodeId}:${p.id}`) ?? []) {
        if (!started.has(link.source) && pullable(link.source)) {
          await runNode(link.source);
        }
      }
    }

    if (started.has(nodeId)) return; // запустился во время pull
    started.add(nodeId);

    const run = state(nodeId);
    run.executions += 1;
    if (run.executions > MAX_NODE_EXECUTIONS) throw new ExecutionAbort('error', 'ERR_CYCLE');

    const inputs: Record<string, unknown> = {};
    const have = delivered.get(nodeId) ?? {};
    for (const p of def.inputs) inputs[p.id] = have[p.id];
    run.inputs = inputs;
    run.startedAt = Date.now();
    state0(nodeId, 'running');

    let outputs: Record<string, unknown> = {};
    let error: string | undefined;
    try {
      if (def.runtime) {
        const connectedInputs = def.inputs.filter((p) => (inByPort.get(`${nodeId}:${p.id}`)?.length ?? 0) > 0).map((p) => p.id);
        const result = await def.runtime({ inputs, connectedInputs, config: node.config ?? {}, payload, runtime });
        outputs = result.outputs ?? {};
        error = result.error;
      }
    } catch (e) {
      error = e instanceof Error && e.message.startsWith('ERR_') ? e.message : 'ERR_RUNTIME';
      pushLog('error', 'ERR_RUNTIME', { node: nodeId, block: def.id, detail: String(e) });
    }
    run.durationMs = Date.now() - run.startedAt;
    run.outputs = outputs;
    run.finishedAt = Date.now();

    // Стоп нажат во время выполнения узла — завершаем схемой STOPPED.
    if (cancel.cancelled) throw new ExecutionAbort('stopped', 'ERR_CANCELLED');

    if (error) {
      run.status = 'error';
      run.error = error;
      pushLog('error', error, { node: nodeId, block: def.id });
      for (const link of outByNode.get(nodeId) ?? []) {
        if (link.kind !== 'error') continue;
        const td = delivered.get(link.target) ?? {};
        td[link.targetPort] = error;
        delivered.set(link.target, td);
        options.onEdgeFlow?.(link.edgeId);
        enqueue(link.target);
      }
      return;
    }

    run.status = 'success';

    // 2) Распространение результата по исходящим соединениям.
    //    Важно: доставляем только порты, в которые handler положил значение.
    //    Если на вход цели ведут несколько соединений (ветки «Да»/«Нет»),
    //    сработавшая ветка отдаёт значение, а «молчащая» не затирает его.
    for (const link of outByNode.get(nodeId) ?? []) {
      options.onEdgeFlow?.(link.edgeId);
      if (link.kind === 'data') {
        if (!Object.prototype.hasOwnProperty.call(outputs, link.sourcePort)) continue;
        const td = delivered.get(link.target) ?? {};
        td[link.targetPort] = outputs[link.sourcePort];
        delivered.set(link.target, td);
        if (isSatisfiable(link.target)) enqueue(link.target);
      } else {
        enqueue(link.target);
      }
    }
  };

  try {
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      queued.delete(nodeId);
      await runNode(nodeId);
    }
    return finish('success');
  } catch (e) {
    if (e instanceof ExecutionAbort) return finish(e.status, e.code);
    throw e;
  }
}
