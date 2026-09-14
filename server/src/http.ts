/**
 * HTTP-помощники сервера: чтение тела запроса с лимитом и ответы в
 * едином формате.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { badRequest, payloadTooLarge, unsupportedMedia } from './errors.ts';

/**
 * Читает и разбирает JSON-тело запроса.
 * - Пустое тело → `{}` (удобно для простых команд).
 * - Не-JSON `content-type` (кроме отсутствующего) → 415.
 * - Превышение лимита → 413.
 * - Битый JSON → 400.
 */
export async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
  const contentType = req.headers['content-type'];
  if (contentType && !contentType.includes('application/json')) {
    throw unsupportedMedia('Ожидается тип содержимого application/json');
  }
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of req) {
    received += (chunk as Buffer).length;
    if (received > maxBytes) throw payloadTooLarge(`Тело запроса больше лимита ${maxBytes} байт`);
    chunks.push(chunk as Buffer);
  }
  if (received === 0) return {};
  const text = Buffer.concat(chunks).toString('utf-8');
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw badRequest('Тело запроса должно быть JSON-объектом');
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof SyntaxError) throw badRequest('Некорректный JSON в теле запроса');
    throw err;
  }
}

/** Отправляет JSON-ответ. */
export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
