/**
 * Чистые помощники лаунчера разработки (подэтап 5.10).
 *
 * Только стандартный язык, без зависимостей — эти функции тестируются
 * (см. `dev-helpers.test.mjs`) и используются `dev-all.mjs`.
 */

/** Порт сервера по умолчанию (3000/3001 запрещены для NODEZZLE). */
export const DEFAULT_API_PORT = 4210;

/** Хост сервера по умолчанию — только локальный. */
export const DEFAULT_API_HOST = '127.0.0.1';

/**
 * Разбирает строку вывода Vite и возвращает локальный адрес интерфейса.
 * Примеры входа: «  ➜  Local:   http://localhost:5173/ »,
 * «Local: http://localhost:5174/». Если адреса нет — `null`.
 */
export function parseViteLocalUrl(line) {
  const match = /Local:\s+(https?:\/\/[^\s]+\/?)/.exec(line);
  return match !== null ? match[1] : null;
}

/** Базовый адрес АПИ из окружения (без хвостов и секретов). */
export function apiBaseUrl(env = {}) {
  const host = typeof env.NODEZZLE_API_HOST === 'string' && env.NODEZZLE_API_HOST !== ''
    ? env.NODEZZLE_API_HOST
    : DEFAULT_API_HOST;
  const rawPort = typeof env.NODEZZLE_API_PORT === 'string' && env.NODEZZLE_API_PORT !== ''
    ? Number(env.NODEZZLE_API_PORT)
    : DEFAULT_API_PORT;
  const port = Number.isInteger(rawPort) && rawPort >= 1 && rawPort <= 65535 ? rawPort : DEFAULT_API_PORT;
  return `http://${host}:${port}`;
}

/** Адрес health-проверки сервера. */
export function healthUrl(env = {}) {
  return `${apiBaseUrl(env)}/api/health`;
}

/**
 * Классифицирует ошибку запуска сервера по выводу — для понятного
 * сообщения на русском. Возвращает `null`, если случай не распознан.
 */
export function classifyServerError(text) {
  if (text.includes('EADDRINUSE')) {
    return 'Порт сервера уже занят другим процессом. Освободите порт или задайте другой через NODEZZLE_API_PORT.';
  }
  if (text.includes('EACCES') || text.includes('EPERM')) {
    return 'Нет прав на запуск сервера (порт или файлы). Запустите от обычного пользователя и проверьте антивирус.';
  }
  if (text.includes('ConfigError') || text.includes('NODEZZLE_API_PORT')) {
    return 'Неверные настройки окружения. Проверьте значения переменных NODEZZLE_* в .env (пример — .env.example).';
  }
  if (text.includes('ERR_MODULE_NOT_FOUND') || text.includes('Cannot find module')) {
    return 'Не найдены зависимости. Выполните «npm install» и запустите снова.';
  }
  return null;
}

/** Команда открытия браузера по платформе (без опасных кавычек). */
export function openBrowserCommand(url, platform = process.platform) {
  if (!/^https?:\/\/127\.0\.0\.1:\d+\/?$/.test(url) && !/^https?:\/\/localhost:\d+\/?$/.test(url)) {
    return null; // открываем только локальные адреса запуска
  }
  if (platform === 'win32') return { command: 'cmd', args: ['/d', '/s', '/c', 'start', '', url] };
  if (platform === 'darwin') return { command: 'open', args: [url] };
  return { command: 'xdg-open', args: [url] };
}
