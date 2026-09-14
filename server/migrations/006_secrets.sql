-- Миграция 006: секреты рабочего пространства (см. docs/DATABASE.md §2.1).
-- Хранится только шифротекст (AES-256-GCM); значения не читаются клиентом
-- и не пишутся в логи. Ссылки из конфигураций блоков — только через
-- secret_id (см. docs/SECURITY.md).

CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_secrets_workspace ON secrets (workspace_id);
