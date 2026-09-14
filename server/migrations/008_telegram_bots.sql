-- Миграция 008: конфигурация Telegram-ботов (см. docs/DATABASE.md §2.1).
-- Токен бота НИКОГДА не хранится здесь — только ссылка на секрет
-- рабочего пространства (значения шифруются в таблице `secrets`).
-- `webhook_path` — случайный публичный сегмент пути вебхука (секрет пути).
-- Удаление секрета каскадно убирает бота: без токена бот не работает.

CREATE TABLE IF NOT EXISTS telegram_bots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects (id) ON DELETE SET NULL,
  secret_id TEXT NOT NULL REFERENCES secrets (id) ON DELETE CASCADE,
  bot_username TEXT,
  bot_name TEXT,
  webhook_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_bots_workspace ON telegram_bots (workspace_id);
CREATE INDEX IF NOT EXISTS idx_bots_webhook ON telegram_bots (webhook_path);
