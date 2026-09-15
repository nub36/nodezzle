/**
 * Клиент серверного АПИ NODEZZLE (Этап 5).
 *
 * Запросы — относительные (в разработке их проксирует Vite на
 * `127.0.0.1:4210`, см. `vite.config.ts`), сессия — в куке
 * `nodezzle_session` (HttpOnly): в `localStorage` сессии и токены
 * не сохраняются. Значения секретов клиенту не возвращаются —
 * модуль оперирует только метаданными.
 */

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface WorkspaceSummary {
  id: string;
  name: string;
}

export interface SecretSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface BotSummary {
  id: string;
  workspaceId: string;
  projectId: string | null;
  secretId: string;
  botUsername: string | null;
  botName: string | null;
  webhookPath: string;
  status: 'connected' | 'disconnected';
  createdAt: string;
  updatedAt: string;
}

/** Исполнение проекта из журналов сервера. */
export interface ExecutionSummary {
  id: string;
  projectId: string;
  status: string;
  source: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
  stepCount: number;
}

/** Шаг исполнения из журналов сервера (сводки без секретов). */
export interface ExecutionStepSummary {
  executionId: string;
  sequence: number;
  nodeId: string;
  blockType: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
  inputSummary: string | null;
  outputSummary: string | null;
}

/** Запись журнала действий. */
export interface AuditEntry {
  id: number;
  workspaceId: string;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ServerApi {
  register(email: string, password: string, name: string): Promise<void>;
  login(email: string, password: string): Promise<void>;
  workspaces(): Promise<WorkspaceSummary[]>;
  secrets(workspaceId: string): Promise<SecretSummary[]>;
  createSecret(workspaceId: string, name: string, value: string): Promise<SecretSummary>;
  bots(workspaceId: string): Promise<BotSummary[]>;
  createBot(workspaceId: string, secretId: string, projectId: string | null): Promise<BotSummary>;
  replaceBotSecret(workspaceId: string, botId: string, secretId: string): Promise<BotSummary>;
  deleteBot(workspaceId: string, botId: string): Promise<void>;
  executions(projectId: string, options?: { status?: string; limit?: number; offset?: number }): Promise<ExecutionSummary[]>;
  execution(executionId: string): Promise<ExecutionSummary>;
  executionSteps(executionId: string): Promise<ExecutionStepSummary[]>;
  audit(workspaceId: string, options?: { action?: string; targetType?: string; limit?: number; offset?: number }): Promise<AuditEntry[]>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function createJsonClient(fetchImpl: FetchLike = fetch) {
  return async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetchImpl(path, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const payload = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string; details?: unknown } }
      | T
      | null;
    if (!response.ok) {
      const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined;
      throw new ApiClientError(
        response.status,
        error?.code ?? 'UNKNOWN',
        error?.message ?? `Ошибка запроса (${response.status})`,
        error?.details,
      );
    }
    return payload as T;
  };
}

export function createServerApi(fetchImpl: FetchLike = fetch): ServerApi {
  const call = createJsonClient(fetchImpl);
  return {
    async register(email, password, name) {
      await call('POST', '/api/auth/register', { email, password, name });
    },
    async login(email, password) {
      await call('POST', '/api/auth/login', { email, password });
    },
    async workspaces() {
      const payload = await call<{ workspaces: WorkspaceSummary[] }>('GET', '/api/workspaces');
      return payload.workspaces;
    },
    async secrets(workspaceId) {
      const payload = await call<{ secrets: SecretSummary[] }>('GET', `/api/workspaces/${workspaceId}/secrets`);
      return payload.secrets;
    },
    async createSecret(workspaceId, name, value) {
      const payload = await call<{ secret: SecretSummary }>('POST', `/api/workspaces/${workspaceId}/secrets`, {
        name,
        value,
      });
      return payload.secret;
    },
    async bots(workspaceId) {
      const payload = await call<{ bots: BotSummary[] }>('GET', `/api/workspaces/${workspaceId}/telegram-bots`);
      return payload.bots;
    },
    async createBot(workspaceId, secretId, projectId) {
      const payload = await call<{ bot: BotSummary }>('POST', `/api/workspaces/${workspaceId}/telegram-bots`, {
        secretId,
        ...(projectId !== null ? { projectId } : {}),
      });
      return payload.bot;
    },
    async replaceBotSecret(workspaceId, botId, secretId) {
      const payload = await call<{ bot: BotSummary }>('PATCH', `/api/workspaces/${workspaceId}/telegram-bots/${botId}`, {
        secretId,
      });
      return payload.bot;
    },
    async deleteBot(workspaceId, botId) {
      await call('DELETE', `/api/workspaces/${workspaceId}/telegram-bots/${botId}`);
    },
    async executions(projectId, options = {}) {
      const params = new URLSearchParams();
      if (options.status !== undefined) params.set('status', options.status);
      if (options.limit !== undefined) params.set('limit', String(options.limit));
      if (options.offset !== undefined) params.set('offset', String(options.offset));
      const query = params.toString();
      const payload = await call<{ executions: ExecutionSummary[] }>(
        'GET',
        `/api/projects/${projectId}/executions${query !== '' ? `?${query}` : ''}`,
      );
      return payload.executions;
    },
    async execution(executionId) {
      const payload = await call<{ execution: ExecutionSummary }>('GET', `/api/executions/${executionId}`);
      return payload.execution;
    },
    async executionSteps(executionId) {
      const payload = await call<{ steps: ExecutionStepSummary[] }>('GET', `/api/executions/${executionId}/steps`);
      return payload.steps;
    },
    async audit(workspaceId, options = {}) {
      const params = new URLSearchParams();
      if (options.action !== undefined) params.set('action', options.action);
      if (options.targetType !== undefined) params.set('targetType', options.targetType);
      if (options.limit !== undefined) params.set('limit', String(options.limit));
      if (options.offset !== undefined) params.set('offset', String(options.offset));
      const query = params.toString();
      const payload = await call<{ entries: AuditEntry[] }>(
        'GET',
        `/api/workspaces/${workspaceId}/audit${query !== '' ? `?${query}` : ''}`,
      );
      return payload.entries;
    },
  };
}
