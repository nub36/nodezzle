/**
 * Конфигурация Telegram-ботов (подэтап 5.8A).
 *
 * Токен бота — только в Secrets Vault (шифрованный); здесь хранятся
 * метаданные и ссылка `secret_id`. Публичный путь вебхука
 * (`webhook_path`) — случайный секрет пути: угадать его нельзя,
 * а в случае утечки он перегенерируется.
 */

import crypto from 'node:crypto';
import type { Db } from '../db.ts';

export interface TelegramBotMeta {
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

interface BotRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  secret_id: string;
  bot_username: string | null;
  bot_name: string | null;
  webhook_path: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TelegramBotStore {
  create(workspaceId: string, secretId: string, projectId: string | null): TelegramBotMeta;
  get(workspaceId: string, botId: string): TelegramBotMeta | null;
  getByWebhookPath(webhookPath: string): TelegramBotMeta | null;
  list(workspaceId: string): TelegramBotMeta[];
  /** Привязка к другому проекту/секрету; метаданные бота (имя/ник) обновляет транспорт. */
  update(
    workspaceId: string,
    botId: string,
    patch: { projectId?: string | null; secretId?: string; botUsername?: string; botName?: string },
  ): TelegramBotMeta | null;
  delete(workspaceId: string, botId: string): boolean;
}

export function createTelegramBotStore(db: Db): TelegramBotStore {
  const insert = db.prepare(
    `INSERT INTO telegram_bots
       (id, workspace_id, project_id, secret_id, webhook_path, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'connected', ?, ?)`,
  );
  const getStmt = db.prepare('SELECT * FROM telegram_bots WHERE id = ? AND workspace_id = ?');
  const byPathStmt = db.prepare('SELECT * FROM telegram_bots WHERE webhook_path = ?');
  const listStmt = db.prepare('SELECT * FROM telegram_bots WHERE workspace_id = ? ORDER BY created_at');
  const deleteStmt = db.prepare('DELETE FROM telegram_bots WHERE id = ? AND workspace_id = ?');

  const toMeta = (r: BotRow): TelegramBotMeta => ({
    id: r.id,
    workspaceId: r.workspace_id,
    projectId: r.project_id,
    secretId: r.secret_id,
    botUsername: r.bot_username,
    botName: r.bot_name,
    webhookPath: r.webhook_path,
    status: r.status === 'connected' ? 'connected' : 'disconnected',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });

  return {
    create(workspaceId, secretId, projectId) {
      const id = crypto.randomUUID();
      const webhookPath = crypto.randomBytes(32).toString('hex');
      const now = new Date().toISOString();
      insert.run(id, workspaceId, projectId, secretId, webhookPath, now, now);
      const row = getStmt.get(id, workspaceId) as unknown as BotRow;
      return toMeta(row);
    },
    get(workspaceId, botId) {
      const row = getStmt.get(botId, workspaceId) as unknown as BotRow | undefined;
      return row ? toMeta(row) : null;
    },
    getByWebhookPath(webhookPath) {
      const row = byPathStmt.get(webhookPath) as unknown as BotRow | undefined;
      return row ? toMeta(row) : null;
    },
    list(workspaceId) {
      const rows = listStmt.all(workspaceId) as unknown as BotRow[];
      return rows.map(toMeta);
    },
    update(workspaceId, botId, patch) {
      const current = this.get(workspaceId, botId);
      if (!current) return null;
      const projectId = patch.projectId === undefined ? current.projectId : patch.projectId;
      const secretId = patch.secretId ?? current.secretId;
      const username = patch.botUsername ?? current.botUsername;
      const name = patch.botName ?? current.botName;
      const now = new Date().toISOString();
      db.prepare(
        `UPDATE telegram_bots
         SET project_id = ?, secret_id = ?, bot_username = ?, bot_name = ?, updated_at = ?
         WHERE id = ? AND workspace_id = ?`,
      ).run(projectId, secretId, username, name, now, botId, workspaceId);
      return this.get(workspaceId, botId);
    },
    delete(workspaceId, botId) {
      return deleteStmt.run(botId, workspaceId).changes > 0;
    },
  };
}
