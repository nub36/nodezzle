-- Миграция 010: шаги исполнения (подэтап 5.9).
-- Хранятся ТОЛЬКО сводки входов/выходов после санитайзера
-- (подэтап 5.9C); полные полезные нагрузки не сохраняются.
-- Набор полей рассчитан на будущий Time Travel Debug.

CREATE TABLE IF NOT EXISTS execution_steps (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES executions (id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  block_type TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('success', 'error', 'stopped', 'skipped')),
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER,
  error_code TEXT,
  input_summary TEXT,
  output_summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_steps_execution_seq ON execution_steps (execution_id, sequence);
