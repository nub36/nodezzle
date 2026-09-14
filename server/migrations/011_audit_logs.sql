-- Миграция 011: журнал действий (подэтап 5.9).
-- Отвечает на вопрос «кто, когда и какое важное действие совершил».
-- Таблица append-only на уровне приложения: код не содержит
-- UPDATE/DELETE для неё, пользовательского АПИ записи/правки нет.
-- Метаданные проходят через санитайзер (подэтап 5.9C).

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  -- NULL допустим для общесистемных записей (рабочее пространство не
  -- обязано существовать); для пользовательских действий заполняется.
  workspace_id TEXT REFERENCES workspaces (id) ON DELETE CASCADE,
  -- NULL — системный актор; подделка пользователя запрещена.
  actor_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_workspace_created ON audit_logs (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_workspace_action ON audit_logs (workspace_id, action);
