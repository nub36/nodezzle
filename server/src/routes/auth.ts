/**
 * Маршруты аккаунтов: регистрация, вход, выход, текущий пользователь.
 *
 * Пароли — только в хешах; сессии — подписанные HttpOnly-cookie;
 * значения секретов никогда не логируются и не возвращаются клиенту.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServerConfig } from '../config.ts';
import { badRequest, conflict, tooManyRequests, unauthorized } from '../errors.ts';
import { readJsonBody, sendJson } from '../http.ts';
import type { RouteContext, Router } from '../router.ts';
import type { AuthStore, UserRecord } from '../auth/store.ts';
import type { WorkspaceStore } from '../workspaces/store.ts';
import { hashPassword, verifyPassword } from '../security/passwords.ts';
import {
  clearSessionCookie,
  newSessionToken,
  parseCookies,
  sessionCookie,
  signToken,
  verifySignedToken,
} from '../security/sessions.ts';
import type { RateLimiter } from '../security/rate-limit.ts';
import type { AuditStore } from '../audit/store.ts';

export interface AuthDeps {
  config: ServerConfig;
  store: AuthStore;
  /** Ограничитель частоты входа/регистрации (по адресу клиента). */
  authLimiter: RateLimiter;
  /** Если передан — при регистрации создаётся рабочее пространство по умолчанию. */
  workspaces?: WorkspaceStore;
  /** Журнал действий (подэтап 5.9). */
  audit: AuditStore;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 256;
const NAME_MAX = 120;

export function clientIp(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown';
}

/** Текущий пользователь по сессионной cookie или `null`. */
export function currentUser(ctx: RouteContext, deps: AuthDeps): UserRecord | null {
  const cookies = parseCookies(ctx.req.headers.cookie);
  const signed = cookies.nodezzle_session;
  if (!signed) return null;
  const token = verifySignedToken(signed, deps.config.sessionSecret);
  if (!token) return null;
  const session = deps.store.getSession(token);
  if (!session) return null;
  return deps.store.getUserById(session.userId);
}

function issueSession(res: ServerResponse, deps: AuthDeps, userId: string): void {
  const token = newSessionToken();
  deps.store.createSession(userId, token, deps.config.sessionTtlDays);
  const cookie = sessionCookie(signToken(token, deps.config.sessionSecret), {
    maxAgeSeconds: deps.config.sessionTtlDays * 24 * 60 * 60,
    secure: deps.config.env === 'production',
  });
  res.setHeader('Set-Cookie', cookie);
}

function validateRegistration(body: Record<string, unknown>): { email: string; password: string; name: string } {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!EMAIL_RE.test(email)) throw badRequest('Укажите корректный адрес электронной почты');
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw badRequest(`Пароль должен быть от ${PASSWORD_MIN} до ${PASSWORD_MAX} символов`);
  }
  if (name === '' || name.length > NAME_MAX) {
    throw badRequest(`Укажите имя (до ${NAME_MAX} символов)`);
  }
  return { email, password, name };
}

export function registerAuthRoutes(router: Router, deps: AuthDeps): void {
  router.post('/api/auth/register', async ({ req, res }) => {
    if (!deps.authLimiter.allow(clientIp(req))) throw tooManyRequests();
    const body = await readJsonBody(req, deps.config.maxBodyBytes);
    const { email, password, name } = validateRegistration(body);
    if (deps.store.getUserByEmail(email)) throw conflict('Пользователь с таким адресом уже зарегистрирован');
    const passwordHash = await hashPassword(password);
    const user = deps.store.createUser(email, name, passwordHash);
    // Новому пользователю сразу создаём личное рабочее пространство.
    if (deps.workspaces) deps.workspaces.create(user.id, 'Мои проекты');
    deps.audit.append({
      actorUserId: user.id,
      action: 'auth.register',
      targetType: 'user',
      targetId: user.id,
      metadata: { email, ip: clientIp(req) },
    });
    issueSession(res, deps, user.id);
    sendJson(res, 201, { user: { id: user.id, email: user.email, name: user.name } });
  });

  router.post('/api/auth/login', async ({ req, res }) => {
    if (!deps.authLimiter.allow(clientIp(req))) throw tooManyRequests();
    const body = await readJsonBody(req, deps.config.maxBodyBytes);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const record = email === '' ? null : deps.store.getUserByEmail(email);
    const ok = record ? await verifyPassword(password, record.passwordHash) : false;
    // Единый ответ на неверный адрес и неверный пароль — без перечисления,
    // кто зарегистрирован в системе.
    if (!ok) throw unauthorized('Неверный адрес или пароль');
    deps.audit.append({
      actorUserId: record!.id,
      action: 'auth.login',
      targetType: 'user',
      targetId: record!.id,
      metadata: { ip: clientIp(req) },
    });
    issueSession(res, deps, record!.id);
    sendJson(res, 200, { user: { id: record!.id, email: record!.email, name: record!.name } });
  });

  router.post('/api/auth/logout', ({ req, res }) => {
    const cookies = parseCookies(req.headers.cookie);
    const signed = cookies.nodezzle_session;
    if (signed) {
      const token = verifySignedToken(signed, deps.config.sessionSecret);
      if (token) {
        const session = deps.store.getSession(token);
        deps.store.deleteSession(token);
        if (session) {
          deps.audit.append({
            actorUserId: session.userId,
            action: 'auth.logout',
            targetType: 'user',
            targetId: session.userId,
          });
        }
      }
    }
    res.setHeader('Set-Cookie', clearSessionCookie());
    sendJson(res, 200, { ok: true });
  });

  router.get('/api/auth/me', (ctx) => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    sendJson(ctx.res, 200, { user: { id: user.id, email: user.email, name: user.name } });
  });
}
