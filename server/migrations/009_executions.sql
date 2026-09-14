-- Миграция 009: история исполнений (подэтап 5.9, см. docs/DATABASE.md).
-- Отвечает на вопрос «что происходило во время выполнения схемы».
-- Статусы — контролируемый набор (см. CHECK); содержимое логов и
-- итогов проходит через санитайзер перед записью (подэтап 5.9C).

CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  -- Версия, снимок которой исполнялся (для LIVE — публикация).
  project_version_id TEXT REFERENCES project_versions (id) ON DELETE SET NULL,
  -- Источник запуска: 'telegram' | 'api' | … (контролируется кодом).
  trigger_type TEXT NOT NULL,
  -- Уточнение источника (например, имя транспорта), санитизировано.
  trigger_source TEXT NOT NULL DEFAULT '',
  telegram_bot_id TEXT REFERENCES telegram_bots (id) ON DELETE SET NULL,
  -- Идентификатор внешнего события (например, update_id) для трассировки.
  external_event_id TEXT,
  -- Вложенные исполнения (будущее: модели, отложенные вызовы).
  parent_execution_id TEXT REFERENCES executions (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'success', 'error', 'stopped', 'timeout')),
  error_code TEXT,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_exec_project_created ON executions (project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_exec_workspace_created ON executions (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_exec_status ON executions (status);
