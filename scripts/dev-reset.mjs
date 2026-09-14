#!/usr/bin/env node
/**
 * Сброс ЛОКАЛЬНЫХ данных разработки NODEZZLE (подэтап 5.10).
 *
 * Запуск: `npm run dev:reset` (спросит подтверждение)
 * или `npm run dev:reset -- --yes` (без вопроса — для скриптов).
 *
 * Удаляет ТОЛЬКО локальную базу данных `server/data/` (проекты,
 * аккаунты, журналы этого компьютера). Код, документы и настройки
 * окружения НЕ трогает. Никогда не запускается автоматически.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(repoRoot, 'server', 'data');

console.log('Сброс локальных данных разработки NODEZZLE.');
console.log(`Будет удалена папка: ${dataDir}`);
console.log('В ней — локальная база данных (аккаунты, проекты, секреты, журналы этого компьютера).');
console.log('Код проекта, документы и настройки окружения удалены НЕ будут.');

const yes = process.argv.includes('--yes');

if (!yes) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question('Введите ДА для удаления локальных данных: ', resolve);
  });
  rl.close();
  if (answer.trim().toUpperCase() !== 'ДА' && answer.trim().toUpperCase() !== 'DA') {
    console.log('Отменено. Ничего не удалено.');
    process.exit(0);
  }
}

if (fs.existsSync(dataDir)) {
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('Локальные данные разработки удалены. При следующем запуске база создастся заново.');
} else {
  console.log('Папка с локальными данными не найдена — удалять нечего.');
}
