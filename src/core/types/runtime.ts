/**
 * NODEZZLE — типы выполнения (Runtime).
 *
 * Состояния выполнения:
 *   IDLE → WAITING → RUNNING → SUCCESS | ERROR | STOPPED
 *
 * Runtime (src/core/runtime/execute.ts) — чистый TypeScript,
 * не зависит от React: его покрывают unit-тесты, а в будущем
 * тот же код может работать на сервере (backend Runtime).
 */

import type { StoredModel } from '../project/schema';

export type ExecutionStatus =
  | 'idle'
  | 'waiting'
  | 'running'
  | 'success'
  | 'error'
  | 'stopped';

export type NodeExecutionStatus = 'idle' | 'running' | 'success' | 'error' | 'skipped';

/**
 * Симулируемый (или реальный) payload, запускающий схему.
 * На MVP-этапе схема запускается симулятором из Debug UI;
 * в будущем payload будет приходить от Telegram Bot API / Web-превью.
 */
export interface TriggerPayload {
  source?: 'telegram' | 'web' | 'model' | 'generic';
  /** Необязательный ID точки входа активного холста; без него — обычный выбор триггеров. */
  targetNodeId?: string;
  telegram?: {
    text: string;
    command?: string;
    user_id: number;
    username?: string;
    chat_id: number;
    raw?: Record<string, unknown>;
  };
  web?: Record<string, unknown>;
  model?: { inputs: Record<string, unknown> };
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  at: number;
  level: LogLevel;
  nodeId?: string;
  blockId?: string;
  message: string;
  data?: unknown;
}

/** Сообщение, «отправленное» в Telegram (симуляция до реального API). */
export interface TelegramOutMessage {
  id: string;
  chatId: number;
  kind: 'text' | 'photo';
  text: string;
  at: number;
}

/**
 * Контекст, доступный обработчику блока во время выполнения.
 * `telegram` — адаптер отправки (сейчас — симуляция/outbox,
 * в будущем — вызовы backend API), `models` — модели проекта,
 * `executeModel` — рекурсивный запуск схемы модели.
 */
export interface RuntimeContext {
  payload: TriggerPayload;
  cancel: { cancelled: boolean };
  log: (level: LogLevel, message: string, data?: unknown) => void;
  telegram: {
    send: (msg: { chatId: number; text: string }) => Promise<number>;
    sendPhoto: (msg: { chatId: number; photo: unknown; caption?: string }) => Promise<number>;
  };
  /** Модели проекта, доступные блоку «Вызов модели». */
  models?: Record<string, StoredModel>;
  /** Вызов модели по ID (рекурсивное выполнение её схемы). */
  executeModel?: (modelId: string, inputs: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** Счётчик выходов модели: сюда пишет блок «Выход модели». */
  modelOutputs?: Record<string, unknown>;
  /** Задел под SHARED MEMORY (общее хранилище). */
  memory?: Map<string, unknown>;
}

/** Контекст, передаваемый в handler блока. */
export interface NodeExecutionContext {
  /** Значения входов: { [portId]: value } */
  inputs: Record<string, unknown>;
  /** Конфигурация конкретного экземпляра блока (data.config). */
  config: Record<string, unknown>;
  payload: TriggerPayload;
  runtime: RuntimeContext;
}

/**
 * Результат работы handler'а блока.
 * `error` — код ошибки (см. i18n-ключи `errors.*`);
 * runtime подсветит блок красным и не будет распространять данные.
 */
export interface NodeHandlerResult {
  outputs?: Record<string, unknown>;
  error?: string;
}

/** Обработчик выполнения блока (runtime handler в Block Definition). */
export type NodeHandler = (
  ctx: NodeExecutionContext,
) => NodeHandlerResult | Promise<NodeHandlerResult>;

/** Полная запись об исполнении одного узла (для Debug UI). */
export interface NodeRunInfo {
  status: NodeExecutionStatus;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  durationMs: number;
  startedAt: number;
  finishedAt?: number;
  executions: number;
  error?: string;
}

export interface ExecutionResult {
  status: 'success' | 'waiting' | 'error' | 'stopped';
  /** Код ошибки выполнения схемы (ключ `errors.*`). */
  error?: string;
  nodeRuns: Record<string, NodeRunInfo>;
  logs: LogEntry[];
  outbox: TelegramOutMessage[];
  durationMs: number;
}
