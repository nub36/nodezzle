/**
 * Конфигурация окружения сервера NODEZZLE.
 *
 * Все настройки — только через переменные окружения (префикс `NODEZZLE_`).
 * Никаких секретов в коде и в репозитории (см. docs/SECURITY.md).
 * Значения по умолчанию рассчитаны на локальную разработку.
 */

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
  };
}
