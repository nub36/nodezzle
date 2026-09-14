/**
 * Сессии: подпись токенов и cookies.
 *
 * Токен сессии — случайные 32 байта (в базе хранится только его
 * SHA-256). Cookie подписывается HMAC-SHA256 секретом сервера —
 * подделка без секрета невозможна.
 */

import crypto from 'node:crypto';

export interface CookieOptions {
  maxAgeSeconds: number;
  secure: boolean;
}

/** Подписывает токен сессии: `<токен>.<подпись>`. */
export function signToken(token: string, secret: string): string {
  const sig = crypto.createHmac('sha256', secret).update(token).digest('base64url');
  return `${token}.${sig}`;
}

/** Проверяет подпись и возвращает токен или `null`. */
export function verifySignedToken(signed: string, secret: string): string | null {
  const dot = signed.lastIndexOf('.');
  if (dot <= 0) return null;
  const token = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret).update(token).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return token;
}

/** SHA-256 от токена — в базе храним только его. */
export function tokenDigest(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Новый случайный токен сессии (32 байта, строка без спецсимволов). */
export function newSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** Собирает заголовок Set-Cookie для сессионной cookie. */
export function sessionCookie(signedToken: string, opts: CookieOptions): string {
  const parts = [
    `nodezzle_session=${signedToken}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${opts.maxAgeSeconds}`,
  ];
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

/** Заголовок очистки сессионной cookie (выход). */
export function clearSessionCookie(): string {
  return 'nodezzle_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

/** Разбирает заголовок Cookie в словарь. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const piece of header.split(';')) {
    const eq = piece.indexOf('=');
    if (eq <= 0) continue;
    const name = piece.slice(0, eq).trim();
    const value = piece.slice(eq + 1).trim();
    if (name !== '') out[name] = decodeURIComponent(value);
  }
  return out;
}
