-- Миграция 007: статус версии проекта.
-- SNAPSHOT — ручной снимок черновика; LIVE — опубликованная версия
-- (именно её использует рантайм); ARCHIVED — бывшая публикация.
-- По умолчанию 'SNAPSHOT': ранее созданные снимки не меняют смысла.

ALTER TABLE project_versions ADD COLUMN status TEXT NOT NULL DEFAULT 'SNAPSHOT';
CREATE INDEX IF NOT EXISTS idx_versions_project_status ON project_versions (project_id, status);
