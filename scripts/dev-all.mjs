#!/usr/bin/env node
/**
 * Единый локальный запуск NODEZZLE: сервер АПИ + интерфейс (подэтап 5.10).
 *
 * Запуск: `npm run dev:all` или двойной клик по `start-nodezzle.bat`.
 * Без тяжёлых process-manager: два дочерних процесса под нашим контролем.
 *
 * Остановка: Ctrl+C — завершаем оба процесса, ничего не висит.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  apiBaseUrl,
  classifyServerError,
  healthUrl,
  openBrowserCommand,
  parseViteLocalUrl,
} from './dev-helpers.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const COLOR = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function say(text, color = '') {
  const prefix = `${COLOR.cyan}[NODEZZLE]${COLOR.reset}`;
  console.log(`${prefix} ${color}${text}${COLOR.reset}`);
}

function line(prefix, color, text) {
  for (const part of text.split(/\r?\n/)) {
    if (part.trim() === '') continue;
    console.log(`${color}[${prefix}]${COLOR.reset} ${part}`);
  }
}

/** Проверка здоровья сервера: пробуем до `timeoutMs`. */
async function waitForHealth(url, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (res.ok) return true;
    } catch {
      /* сервер ещё поднимается */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

async function main() {
  say('Запускаем локальную среду: сервер АПИ + интерфейс…', COLOR.bold);
  say(`Сервер АПИ (адрес по умолчанию): ${apiBaseUrl(process.env)}`, COLOR.dim);

  let stopping = false;
  const children = [];

  const stopAll = (code, reason) => {
    if (stopping) return;
    stopping = true;
    if (reason !== undefined && reason !== '') say(reason, COLOR.yellow);
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill('SIGTERM');
        } catch {
          /* процесс уже завершился */
        }
      }
    }
    // Страховка: если дочерние процессы не ушли за 3 секунды — выходим сами.
    setTimeout(() => process.exit(code), 3_000).unref();
    setTimeout(() => {
      for (const child of children) {
        try {
          child.kill('SIGKILL');
        } catch {
          /* уже нет */
        }
      }
      process.exit(code);
    }, 2_500).unref();
  };

  process.on('SIGINT', () => stopAll(0, 'Останавливаем NODEZZLE (Ctrl+C)…'));
  process.on('SIGTERM', () => stopAll(0, 'Останавливаем NODEZZLE…'));

  // Запускаем процессы напрямую через `node` (без обёрток пакетного
  // менеджера): при остановке завершаются именно они, ничего не висит.

  // --- Сервер АПИ -------------------------------------------------------
  const server = spawn(
    process.execPath,
    ['--watch', '--import', './server/src/register-alias.mjs', 'server/src/index.ts'],
    { cwd: repoRoot, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  children.push(server);

  let serverFailedText = '';
  let fatalErrorReported = false;

  /**
   * В режиме `--watch` упавший сервер не завершается, а ждёт изменений
   * файлов. Поэтому фатальные ошибки (занятый порт, битая конфигурация,
   * отсутствие зависимостей) ловим по выводу и останавливаем среду сами.
   */
  const checkServerFatalError = () => {
    if (fatalErrorReported || stopping) return;
    const known = classifyServerError(serverFailedText);
    if (known !== null) {
      fatalErrorReported = true;
      say(`[ОШИБКА] ${known}`, COLOR.red);
      stopAll(1, '');
    } else if (serverFailedText.includes('Waiting for file changes before restarting')) {
      fatalErrorReported = true;
      say('[ОШИБКА] Сервер АПИ упал при запуске — причина в сообщениях выше.', COLOR.red);
      stopAll(1, '');
    }
  };

  server.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    serverFailedText += text;
    line('сервер', COLOR.green, text);
    checkServerFatalError();
  });
  server.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    serverFailedText += text;
    line('сервер', COLOR.yellow, text);
    checkServerFatalError();
  });
  server.on('exit', (code, signal) => {
    if (stopping) return;
    const known = classifyServerError(serverFailedText);
    say(
      known ?? `Сервер АПИ завершился неожиданно (код ${code ?? signal}).`,
      COLOR.red,
    );
    stopAll(1, '');
  });

  // --- Интерфейс (Vite) --------------------------------------------------
  const client = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0', '--port', '5173'],
    { cwd: repoRoot, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  children.push(client);

  let frontendUrl = null;
  client.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    for (const rawLine of text.split(/\r?\n/)) {
      const found = parseViteLocalUrl(rawLine);
      if (found !== null && frontendUrl === null) {
        frontendUrl = found;
        say(`Интерфейс: ${found}`, COLOR.bold + COLOR.green);
        const openCmd = openBrowserCommand(found);
        if (openCmd !== null) {
          const opener = spawn(openCmd.command, openCmd.args, { stdio: 'ignore', detached: true });
          opener.on('error', () => {
            say('Не удалось открыть браузер автоматически — откройте адрес выше вручную.', COLOR.yellow);
          });
          opener.unref();
        }
      }
    }
    line('клиент', COLOR.cyan, text);
  });
  client.stderr.on('data', (chunk) => line('клиент', COLOR.yellow, chunk.toString()));
  client.on('exit', (code, signal) => {
    if (stopping) return;
    say(`Интерфейс завершился неожиданно (код ${code ?? signal}).`, COLOR.red);
    stopAll(1, '');
  });

  // --- Итоговое сообщение о состоянии ------------------------------------
  const healthy = await waitForHealth(healthUrl(process.env));
  if (healthy) {
    say(`Сервер: работает (${healthUrl(process.env)})`, COLOR.green);
  } else {
    say('Сервер: ещё не ответил на health-проверку — смотрите вывод выше.', COLOR.yellow);
  }

  say('', COLOR.reset);
  say('NODEZZLE запущен. Остановка — клавиши Ctrl+C в этом окне.', COLOR.bold);
}

main().catch((error) => {
  say(`Не удалось запустить среду: ${error instanceof Error ? error.message : String(error)}`, COLOR.red);
  process.exit(1);
});
