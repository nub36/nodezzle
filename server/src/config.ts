/**
 * Конфигурация окружения сервера NODEZZLE.
 *
 * Все настройки — только через переменные окружения (префикс `NODEZZLE_`).
 * Никаких секретов в коде и в репозитории (см. docs/SECURITY.md).
 * Значения по умолчанию рассчитаны на локальную разработку.
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ServerConfig {
  /** Хост, который слушает API (локально — 127.0.0.1). */
  host: string;
  /** Порт API. Запрещены 3000/3001 (чужой сайт на VPS). */
  port: number;
  /** Путь к файлу SQLite. */
  dbPath: string;
  /** development | production. */
  env: 'development' | 'production';
  /** Корень репозитория (каталог, содержащий `server/`). */
  repoRoot: string;
  /** Лимит тела запроса, байты. */
  maxBodyBytes: number;
  /** Секрет подписи сессий. В продакшне обязателен. */
  sessionSecret: string;
  /** Ключ шифрования секретов (64 hex-символа); если не задан, выводится из секрета сессий. */
  vaultKeyHex?: string;
  /** Таймаут одного исполнения на сервере, мс (по умолчанию 10 000). */
  execTimeoutMs?: number;
  /** Параллельные исполнения на сервере (по умолчанию 2). */
  execMaxParallel?: number;
  /** Время жизни сессии, дней. */
  sessionTtlDays: number;
}

/** Порты, запрещённые для NODEZZLE всегда (см. docs/agent-plan/RULES.md, правило 16). */
export const FORBIDDEN_PORTS = new Set([3000, 3001]);

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function repoRoot(): string {
  // server/src/config.ts → корень на два уровня выше каталога файла.
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new ConfigError(`NODEZZLE_API_PORT: ожидается целое число 1..65535, получено «${raw}»`);
  }
  if (FORBIDDEN_PORTS.has(value)) {
    throw new ConfigError(`NODEZZLE_API_PORT: порт ${value} запрещён для NODEZZLE (занят сторонним сервисом)`);
  }
  return value;
}

function parseSessionTtlDays(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 365) {
    throw new ConfigError(`NODEZZLE_SESSION_TTL_DAYS: ожидается целое число 1..365, получено «${raw}»`);
  }
  return value;
}

/**
 * Секрет сессий: в продакшне обязателен и должен задаваться окружением;
 * в разработке генерируется случайный на каждый запуск (сессии переживают
 * только текущий процесс — для локальной работы этого достаточно).
 */
function resolveSessionSecret(env: NodeJS.ProcessEnv, mode: 'development' | 'production'): string {
  const raw = env.NODEZZLE_SESSION_SECRET?.trim();
  if (raw && raw.length >= 32) return raw;
  if (mode === 'production') {
    throw new ConfigError('NODEZZLE_SESSION_SECRET обязателен в продакшне (минимум 32 символа)');
  }
  if (raw !== undefined && raw !== '') {
    throw new ConfigError('NODEZZLE_SESSION_SECRET слишком короткий (минимум 32 символа)');
  }
  console.warn('[nodezzle-api] NODEZZLE_SESSION_SECRET не задан — использую случайный секрет разработки');
  return crypto.randomBytes(32).toString('hex');
}

function parseMaxBody(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) {
    throw new ConfigError(`NODEZZLE_MAX_BODY_BYTES: ожидается положительное число, получено «${raw}»`);
  }
  return Math.floor(value);
}

/**
 * Собирает конфигурацию из переменных окружения.
 * Бросает `ConfigError` при недопустимых значениях — сервер с битой
 * конфигурацией запускаться не должен.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const nodeEnv = env.NODEZZLE_ENV ?? env.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'production') {
    throw new ConfigError(`NODEZZLE_ENV: ожидается development или production, получено «${nodeEnv}»`);
  }
  const root = repoRoot();
  return {
    host: env.NODEZZLE_API_HOST?.trim() || '127.0.0.1',
    port: parsePort(env.NODEZZLE_API_PORT, 4210),
    dbPath: env.NODEZZLE_DB_PATH?.trim() || path.join(root, 'server', 'data', 'nodezzle.db'),
    env: nodeEnv,
    repoRoot: root,
    maxBodyBytes: parseMaxBody(env.NODEZZLE_MAX_BODY_BYTES, 256 * 1024),
    sessionSecret: resolveSessionSecret(env, nodeEnv),
    sessionTtlDays: parseSessionTtlDays(env.NODEZZLE_SESSION_TTL_DAYS, 30),
    vaultKeyHex: env.NODEZZLE_VAULT_KEY?.trim() || undefined,
    execTimeoutMs: parseExecTimeout(env.NODEZZLE_EXEC_TIMEOUT_MS),
    execMaxParallel: parseExecParallel(env.NODEZZLE_EXEC_PARALLEL),
  };
}


function parseExecTimeout(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 10_000;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 100 || value > 300_000) {
    throw new ConfigError('NODEZZLE_EXEC_TIMEOUT_MS: ожидается целое число от 100 до 300000');
  }
  return value;
}

function parseExecParallel(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 2;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 8) {
    throw new ConfigError('NODEZZLE_EXEC_PARALLEL: ожидается целое число от 1 до 8');
  }
  return value;
}
