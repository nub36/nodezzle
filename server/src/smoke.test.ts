/**
 * Дымовой тест: настоящий запуск сервера процессом `node`.
 *
 * Vitest собирает TS через esbuild и пропускает конструкции, которые
 * запрещены встроенным type-stripping Node (parameter properties, enum и
 * т. п.). Этот тест поднимает `server/src/index.ts` именно так, как его
 * запустит владелец, и поэтому ловит такие регрессии.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

let child: ChildProcess | null = null;

/** Находит свободный локальный порт и сразу отдаёт его тесту. */
async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const addr = probe.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

afterAll(() => {
  child?.kill('SIGKILL');
});

async function waitForLine(stream: NodeJS.ReadableStream, needle: RegExp, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error(`не дождались ${needle}; буфер: ${buffer}`)), timeoutMs);
    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const m = buffer.match(needle);
      if (m) {
        clearTimeout(timer);
        resolve(m[0]);
      }
    });
  });
}

describe('Дымовой запуск сервера (реальный процесс)', () => {
  it('запускается, применяет миграции и отвечает /api/health', async () => {
    const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nodezzle-smoke-')), 'db.sqlite');
    const port = await getFreePort();
    child = spawn(process.execPath, ['--import', path.join(repoRoot, 'server', 'src', 'register-alias.mjs'), path.join(repoRoot, 'server', 'src', 'index.ts')], {
      env: {
        ...process.env,
        NODEZZLE_API_HOST: '127.0.0.1',
        NODEZZLE_API_PORT: String(port),
        NODEZZLE_DB_PATH: dbPath,
        NODEZZLE_ENV: 'development',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stderr!.on('data', (c: Buffer) => process.stderr.write(`[smoke stderr] ${c}`));
    const line = await waitForLine(child.stdout!, /http:\/\/127\.0\.0\.1:\d+/, 15000);
    const base = line.match(/http:\/\/127\.0\.0\.1:\d+/)![0];

    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(fs.existsSync(dbPath)).toBe(true);

    child.kill('SIGTERM');
    child = null;
  }, 30000);
});
