-- Миграция 004: проекты на сервере (см. docs/DATABASE.md §2.1).
-- Документ проекта хранится целиком (формат NodezzleProject), колонки —
-- индексы для списков. Секретов в документе нет и не будет.

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  format_version INTEGER NOT NULL,
  document TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects (workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects (updated_at);
