/** Слой БД: миграции применяются один раз, по порядку и идемпотентно. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appliedMigrations, openDb, runMigrations, type Db } from './db.ts';

let dir: string;
let db: Db;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodezzle-mig-'));
  db = openDb(':memory:');
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeMigration(name: string, sql: string): void {
  fs.writeFileSync(path.join(dir, name), sql, 'utf-8');
}

describe('Мигратор', () => {
  it('применяет миграции по порядку и фиксирует их', () => {
    writeMigration('002_second.sql', 'CREATE TABLE b (id INTEGER);');
    writeMigration('001_first.sql', 'CREATE TABLE a (id INTEGER);');
    const applied = runMigrations(db, dir);
    expect(applied).toEqual(['001_first.sql', '002_second.sql']);
    expect(appliedMigrations(db)).toEqual(['001_first.sql', '002_second.sql']);
  });

  it('не применяет повторно уже применённые', () => {
    writeMigration('001_first.sql', 'CREATE TABLE a (id INTEGER);');
    runMigrations(db, dir);
    const second = runMigrations(db, dir);
    expect(second).toEqual([]);
  });

  it('откатывает транзакцию при ошибке и сообщает имя файла', () => {
    writeMigration('001_bad.sql', 'CREATE TABLE a (id INTEGER); NOT A SQL;');
    expect(() => runMigrations(db, dir)).toThrow(/001_bad.sql/);
    expect(appliedMigrations(db)).toEqual([]);
    // Таблица из частично выполненного скрипта не должна остаться.
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='a'")
      .all();
    expect(rows).toEqual([]);
  });

  it('применяет реальные миграции репозитория (001 — пользователи)', () => {
    const realDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'migrations');
    const applied = runMigrations(db, realDir);
    expect(applied).toContain('001_users.sql');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
      .all();
    expect(tables.length).toBe(1);
  });
});
