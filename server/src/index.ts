/**
 * Точка входа сервера NODEZZLE.
 *
 * Запуск (локальная разработка): `npm run server:dev`
 * или вручную: `node server/src/index.ts` (Node ≥ 22.18).
 *
 * Конфигурация — только через переменные окружения (см. .env.example).
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { loadConfig } from './config.ts';
import { openDb, runMigrations } from './db.ts';
import { createApp } from './app.ts';

function readVersion(repoRoot: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function main(): void {
  const config = loadConfig();
  const db = openDb(config.dbPath);
  const migrationsDir = path.join(config.repoRoot, 'server', 'migrations');
  const applied = runMigrations(db, migrationsDir);
  if (applied.length > 0) {
    console.log(`[nodezzle-api] применены миграции: ${applied.join(', ')}`);
  }

  const app = createApp({ config, db, version: readVersion(config.repoRoot) });
  const server = http.createServer(app.handle);
  server.listen(config.port, config.host, () => {
    const addr = server.address();
    const actualPort = typeof addr === 'object' && addr !== null ? addr.port : config.port;
    console.log(`[nodezzle-api] NODEZZLE API запущен: http://${config.host}:${actualPort} (${config.env})`);
    console.log(`[nodezzle-api] база данных: ${config.dbPath}`);
  });

  const shutdown = (): void => {
    console.log('[nodezzle-api] остановка…');
    server.close(() => {
      db.close();
      process.exit(0);
    });
    // Если соединения не закрылись за 3 секунды — выходим принудительно.
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
