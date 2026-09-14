/**
 * Хранилище секретов рабочего пространства.
 *
 * Значения шифруются на входе и расшифровываются только внутри сервера
 * (для рантайма исполнителя). Клиенту возвращается лишь метаданные
 * (имя, идентификатор, даты).
 */

import crypto from 'node:crypto';
import type { Db } from '../db.ts';
import { decryptValue, encryptValue, resolveVaultKey, type SealedValue } from '../security/vault.ts';
import type { ServerConfig } from '../config.ts';

export interface SecretMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface SecretRow {
  id: string;
  workspace_id: string;
  name: string;
  ciphertext: string;
  iv: string;
  tag: string;
  created_at: string;
  updated_at: string;
}

export interface SecretStore {
  create(workspaceId: string, name: string, value: string): SecretMeta;
  list(workspaceId: string): SecretMeta[];
  /** Внутренний доступ для рантайма; наружу значения не отдаются. */
  decrypt(workspaceId: string, secretId: string): string | null;
  delete(workspaceId: string, secretId: string): boolean;
}

export function createSecretStore(db: Db, config: ServerConfig): SecretStore {
  const key = resolveVaultKey(config);

  const insert = db.prepare(
    'INSERT INTO secrets (id, workspace_id, name, ciphertext, iv, tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const listStmt = db.prepare(
    'SELECT id, name, created_at, updated_at FROM secrets WHERE workspace_id = ? ORDER BY name',
  );
  const getStmt = db.prepare('SELECT * FROM secrets WHERE id = ? AND workspace_id = ?');
  const deleteStmt = db.prepare('DELETE FROM secrets WHERE id = ? AND workspace_id = ?');

  const toMeta = (r: { id: string; name: string; created_at: string; updated_at: string }): SecretMeta => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });

  return {
    create(workspaceId, name, value) {
      const sealed = encryptValue(key, value);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      insert.run(id, workspaceId, name, sealed.ciphertext, sealed.iv, sealed.tag, now, now);
      return { id, name, createdAt: now, updatedAt: now };
    },
    list(workspaceId) {
      const rows = listStmt.all(workspaceId) as unknown as SecretRow[];
      return rows.map(toMeta);
    },
    decrypt(workspaceId, secretId) {
      const row = getStmt.get(secretId, workspaceId) as SecretRow | undefined;
      if (!row) return null;
      const sealed: SealedValue = { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag };
      return decryptValue(key, sealed);
    },
    delete(workspaceId, secretId) {
      return deleteStmt.run(secretId, workspaceId).changes > 0;
    },
  };
}
