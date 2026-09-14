-- Миграция 005: версии проектов (см. docs/DATABASE.md §2.1).
-- Снапшот — полная копия документа проекта на момент создания.
-- Проект в таблице projects — редактируемый «черновик» (Draft);
-- неизменяемые публикации появятся в подэтапе 5.6.

CREATE TABLE IF NOT EXISTS project_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_versions_project ON project_versions (project_id, created_at);
