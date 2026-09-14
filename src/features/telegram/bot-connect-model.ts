/**
 * Логика подключения Telegram-бота (подэтап 5.8E) — чистые функции
 * поверх АПИ-клиента, чтобы панель была проверяемой без DOM.
 *
 * Принцип: токен вводится один раз (поле пароля), уходит только в
 * зашифрованное хранилище сервера и НИКОГДА не возвращается: ни в
 * результатах этих функций, ни в `localStorage`, ни в Project JSON.
 */

import type { BotSummary, SecretSummary, ServerApi } from '@/lib/server-api';

export interface ConnectBotInput {
  workspaceId: string;
  /** Имя секрета, под которым токен сохранится в хранилище. */
  secretName: string;
  /** Токен бота — однократный ввод, после отправки нигде не остаётся. */
  token: string;
  projectId: string | null;
}

export interface ConnectBotResult {
  secret: SecretSummary;
  bot: BotSummary;
}

const TOKEN_RE = /^\d{1,20}:[A-Za-z0-9_-]{20,64}$/;

/** Грубая проверка формата токена до отправки. */
export function looksLikeBotToken(token: string): boolean {
  return TOKEN_RE.test(token.trim());
}

export function validateSecretName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'empty';
  if (trimmed.length > 120) return 'too_long';
  return null;
}

/** Подключить бота: секрет в хранилище + бот, привязанный к секрету. */
export async function connectBot(api: ServerApi, input: ConnectBotInput): Promise<ConnectBotResult> {
  const nameError = validateSecretName(input.secretName);
  if (nameError) throw new Error(`SECRET_NAME_${nameError.toUpperCase()}`);
  if (!looksLikeBotToken(input.token)) throw new Error('TOKEN_FORMAT');
  const secret = await api.createSecret(input.workspaceId, input.secretName.trim(), input.token.trim());
  const bot = await api.createBot(input.workspaceId, secret.id, input.projectId);
  return { secret, bot };
}

/** Заменить токен: новый секрет + переключение бота на него. */
export async function replaceBotToken(
  api: ServerApi,
  input: { workspaceId: string; botId: string; secretName: string; token: string },
): Promise<BotSummary> {
  const nameError = validateSecretName(input.secretName);
  if (nameError) throw new Error(`SECRET_NAME_${nameError.toUpperCase()}`);
  if (!looksLikeBotToken(input.token)) throw new Error('TOKEN_FORMAT');
  const secret = await api.createSecret(input.workspaceId, input.secretName.trim(), input.token.trim());
  return api.replaceBotSecret(input.workspaceId, input.botId, secret.id);
}

/** Короткое имя секрета-источника токена для отображения (без значения). */
export function botTokenRef(bot: BotSummary, secrets: SecretSummary[]): string | null {
  const secret = secrets.find((s) => s.id === bot.secretId);
  return secret ? secret.name : null;
}
