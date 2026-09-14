/**
 * Слой базы данных: подключение к SQLite (встроенный `node:sqlite`)
 * и мигратор.
 *
 * Правила (см. docs/DATABASE.md §2.2):
 * - схема меняется только нумерованными миграциями;
 * - миграции идемпотентны и применяются только вперёд;
 * - применённые фиксируются в `schema_migrations`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

/** Открывает (или создаёт) базу данных. Каталог создаётся при необходимости. */
export function openDb(dbPath: string): Db {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

/** Гарантирует служебную таблицу учёта миграций. */
export function ensureMigrationsTable(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}

/** Список применённых миграций (по имени файла). */
export function appliedMigrations(db: Db): string[] {
  const rows = db.prepare('SELECT name FROM schema_migrations ORDER BY name').all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

/**
 * Применяет все миграции из каталога, которых ещё нет в базе.
 * Файлы вида `001_initial.sql` выполняются в лексикографическом порядке,
 * каждая — в отдельной транзакции.
 */
export function runMigrations(db: Db, migrationsDir: string): string[] {
  ensureMigrationsTable(db);
  const applied = new Set(appliedMigrations(db));
  const files = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
    : [];
  const newly: string[] = [];
  const insert = db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)');
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    db.exec('BEGIN;');
    try {
      db.exec(sql);
      insert.run(file, new Date().toISOString());
      db.exec('COMMIT;');
      newly.push(file);
    } catch (err) {
      db.exec('ROLLBACK;');
      throw new Error(`Миграция ${file} не применилась: ${(err as Error).message}`);
    }
  }
  return newly;
}
