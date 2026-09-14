-- Миграция 003: рабочие пространства и участники (см. docs/DATABASE.md §2.1).

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_members_user ON workspace_members (user_id);
