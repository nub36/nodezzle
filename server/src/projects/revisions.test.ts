/** Реальная SQLite: миграция старой БД и атомарный CAS между подключениями. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDb, runMigrations, type Db } from '../db.ts';
import { createProjectStore } from './store.ts';
import { createDemoProject } from '../../../src/demo/seed.ts';
const migrations = path.resolve(import.meta.dirname, '../../migrations');
let dir: string;
let db: Db;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodezzle-revisions-')); db = openDb(path.join(dir, 'db.sqlite')); });
afterEach(() => { vi.useRealTimers(); db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
function seedOwner() {
  db.exec("INSERT INTO users VALUES ('u','u@example.invalid','Имя','fake-test-hash','old','old'); INSERT INTO workspaces VALUES ('w','u','Мои','old','old');");
}
function setup() { runMigrations(db, migrations); seedOwner(); return createProjectStore(db); }
describe('ревизии хранилища', () => {
  it('мигрирует заполненную БД без изменения документов/дат/версий и не меняет ревизию при повторном запуске', () => {
    const oldDir = path.join(dir, 'old'); fs.mkdirSync(oldDir);
    for (const file of fs.readdirSync(migrations).filter((f) => f < '012')) fs.copyFileSync(path.join(migrations, file), path.join(oldDir, file));
    runMigrations(db, oldDir); seedOwner();
    const doc = JSON.stringify(createDemoProject());
    db.prepare("INSERT INTO projects VALUES ('p','w','Старый','telegram',1,?,'created','updated')").run(doc);
    db.prepare("INSERT INTO project_versions (id,project_id,label,snapshot,created_at,status) VALUES ('v','p','Версия',?,'old','LIVE')").run(doc);
    const before = db.prepare('SELECT * FROM projects').get();
    const versions = db.prepare('SELECT * FROM project_versions').all();
    expect(runMigrations(db, migrations)).toEqual(['012_project_revisions.sql']);
    const after = db.prepare('SELECT * FROM projects').get()!;
    expect(after.revision).toMatch(/^[0-9a-f]{32}$/);
    expect(after).toEqual({ ...before, revision: after.revision });
    expect(db.prepare('SELECT * FROM project_versions').all()).toEqual(versions);
    expect(runMigrations(db, migrations)).toEqual([]);
    expect(db.prepare('SELECT * FROM projects').get()).toEqual(after);
  });
  it('два подключения с одной ревизией: только одна запись, даже при одинаковом времени', () => {
    const first = setup(); const original = first.create('w', createDemoProject());
    const secondDb = openDb(path.join(dir, 'db.sqlite'));
    try {
      const second = createProjectStore(secondDb);
      expect(second.get(original.id)?.revision).toBe(original.revision);
      vi.useFakeTimers(); vi.setSystemTime(new Date(original.updatedAt));
      const saved = first.update(original.id, { ...original.document, name: 'А' }, original.revision)!;
      expect(saved.updatedAt).toBe(original.updatedAt); expect(saved.revision).not.toBe(original.revision);
      expect(second.update(original.id, { ...original.document, name: 'Б' }, original.revision)).toBeNull();
      expect(second.get(original.id)).toEqual(saved);
      expect(second.delete(original.id, original.revision)).toBe(false);
      expect(first.get(original.id)).toEqual(saved);
      expect(second.update(original.id, saved.document, saved.revision)?.revision).not.toBe(saved.revision);
    } finally { secondDb.close(); }
  });
  it('удаление и повторное создание того же ID не принимают старую ревизию (ABA)', () => {
    const store = setup(); const old = store.create('w', createDemoProject());
    expect(store.delete(old.id, old.revision)).toBe(true);
    const recreated = store.create('w', old.document);
    expect(recreated.revision).not.toBe(old.revision);
    expect(store.update(old.id, { ...old.document, name: 'поздняя запись' }, old.revision)).toBeNull();
    expect(store.delete(old.id, old.revision)).toBe(false);
    expect(store.get(old.id)).toEqual(recreated);
  });
  it('несуществующий ID и несовпадающий ID документа не создают/не перезаписывают проект', () => {
    const store = setup(); const source = store.create('w', createDemoProject());
    expect(() => store.update(source.id, { ...source.document, id: 'another' }, source.revision)).toThrow();
    expect(store.update('missing', { ...source.document, id: 'missing' }, source.revision)).toBeNull();
    expect(store.get(source.id)).toEqual(source);
    expect(store.listInWorkspace('w')[0].revision).toBe(source.revision);
  });
});
