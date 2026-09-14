/**
 * Хранилище пользователей и сессий (таблицы `users`, `sessions`).
 *
 * Пароли — только как scrypt-хеш; токены сессий — только как SHA-256
 * дайджесты. Значения секретов в эти таблицы не попадают.
 */

import crypto from 'node:crypto';
import type { Db } from '../db.ts';
import { tokenDigest } from '../security/sessions.ts';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface SessionRecord {
  userId: string;
  createdAt: string;
  expiresAt: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
}

interface SessionRow {
  user_id: string;
  created_at: string;
  expires_at: string;
}

export interface AuthStore {
  createUser(email: string, name: string, passwordHash: string): UserRecord;
  getUserByEmail(email: string): (UserRecord & { passwordHash: string }) | null;
  getUserById(id: string): UserRecord | null;
  createSession(userId: string, token: string, ttlDays: number): void;
  getSession(token: string): SessionRecord | null;
  deleteSession(token: string): void;
  deleteExpiredSessions(now?: Date): number;
}

function toUser(row: UserRow): UserRecord {
  return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at };
}

export function createAuthStore(db: Db): AuthStore {
  const insertUser = db.prepare(
    'INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const byEmail = db.prepare('SELECT * FROM users WHERE email = ?');
  const byId = db.prepare('SELECT * FROM users WHERE id = ?');
  const insertSession = db.prepare(
    'INSERT INTO sessions (token_digest, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  );
  const sessionByDigest = db.prepare('SELECT * FROM sessions WHERE token_digest = ?');
  const deleteSessionStmt = db.prepare('DELETE FROM sessions WHERE token_digest = ?');
  const deleteExpired = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');

  return {
    createUser(email, name, passwordHash) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      insertUser.run(id, email, name, passwordHash, now, now);
      return { id, email, name, createdAt: now };
    },
    getUserByEmail(email) {
      const row = byEmail.get(email) as UserRow | undefined;
      if (!row) return null;
      return { ...toUser(row), passwordHash: row.password_hash };
    },
    getUserById(id) {
      const row = byId.get(id) as UserRow | undefined;
      return row ? toUser(row) : null;
    },
    createSession(userId, token, ttlDays) {
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + ttlDays * 24 * 60 * 60 * 1000);
      insertSession.run(tokenDigest(token), userId, createdAt.toISOString(), expiresAt.toISOString());
    },
    getSession(token) {
      const row = sessionByDigest.get(tokenDigest(token)) as SessionRow | undefined;
      if (!row) return null;
      if (new Date(row.expires_at).getTime() <= Date.now()) {
        deleteSessionStmt.run(tokenDigest(token));
        return null;
      }
      return { userId: row.user_id, createdAt: row.created_at, expiresAt: row.expires_at };
    },
    deleteSession(token) {
      deleteSessionStmt.run(tokenDigest(token));
    },
    deleteExpiredSessions(now = new Date()) {
      const info = deleteExpired.run(now.toISOString());
      return Number(info.changes ?? 0);
    },
  };
}
