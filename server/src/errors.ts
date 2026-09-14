/**
 * Централизованные ошибки API NODEZZLE.
 *
 * Единый формат ошибки для клиента:
 *   { "error": { "code": "<АНГЛ_КОД>", "message": "<человекочитаемое сообщение>" } }
 * Технические коды — английские; сообщения могут быть русскими
 * (пользовательский интерфейс продукта — русский).
 */

import type { ServerResponse } from 'node:http';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  /** status — HTTP-статус; code — стабильный машинный код ошибки. */
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message: string): ApiError => new ApiError(400, 'BAD_REQUEST', message);
export const unauthorized = (message = 'Требуется вход'): ApiError => new ApiError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Недостаточно прав'): ApiError => new ApiError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Не найдено'): ApiError => new ApiError(404, 'NOT_FOUND', message);
export const conflict = (message: string): ApiError => new ApiError(409, 'CONFLICT', message);
export const unsupportedMedia = (message = 'Неподдерживаемый тип содержимого'): ApiError =>
  new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', message);
export const payloadTooLarge = (message = 'Слишком большой запрос'): ApiError =>
  new ApiError(413, 'PAYLOAD_TOO_LARGE', message);
export const tooManyRequests = (message = 'Слишком много запросов, попробуйте позже'): ApiError =>
  new ApiError(429, 'TOO_MANY_REQUESTS', message);
export const internal = (message = 'Внутренняя ошибка сервера'): ApiError =>
  new ApiError(500, 'INTERNAL', message);

/** Отправляет ошибку клиенту в едином формате. */
export function sendError(res: ServerResponse, err: unknown): void {
  const known = err instanceof ApiError;
  const status = known ? err.status : 500;
  const code = known ? err.code : 'INTERNAL';
  // Внутренние ошибки не раскрываем клиенту — только в журнал.
  const message = known ? err.message : 'Внутренняя ошибка сервера';
  if (!known) {
    console.error('[nodezzle-api] необработанная ошибка:', err);
  }
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: { code, message } }));
}
