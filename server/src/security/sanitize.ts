/**
 * Централизованный санитайзер журналов (подэтап 5.9C).
 *
 * Исполнения, шаги и метаданные аудита проходят через него ДО записи.
 * Задача: журналы никогда не должны становиться способом украсть
 * секреты (токены, пароли, куки, ключи, адреса БД).
 *
 * Принцип — не полагаться только на имя поля:
 *  - чувствительные КЛЮЧИ маскируются независимо от значения;
 *  - чувствительные ЗНАЧЕНИЯ-строки (формат токена, «Bearer …»,
 *    Basic-авторизация) маскируются независимо от ключа;
 *  - циклические ссылки, функции, `undefined`, Error — безопасны;
 *  - глубина, длина строк, размеры массивов/объектов и итоговый
 *    размер сводки ограничены — большой полезный груз не кладёт
 *    сервер и не раздувает БД.
 */

export const REDACTED = '[СКРЫТО]';

/** Таймаут-маркеры размеров (см. план 06, раздел «Лимиты исполнения»). */
export const SANITIZE_LIMITS = {
  maxDepth: 8,
  maxStringLen: 400,
  maxArrayItems: 40,
  maxObjectKeys: 64,
  summaryMaxBytes: 2048,
  auditMetadataMaxBytes: 2048,
} as const;

const SENSITIVE_KEY_RE =
  /(token|secret|password|passwd|passphrase|authorization|auth_token|cookie|session|credential|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|private[_-]?key|ssh|database[_-]?url|db[_-]?url|connection[_-]?string|webhook[_-]?secret|signing[_-]?key)/i;

/** Формат токена бота: `123456:секрет-из-символов`. */
const TELEGRAM_TOKEN_RE = /^\d{1,20}:[A-Za-z0-9_-]{16,}$/;
/** «Bearer …», «Basic …» в заголовках. */
const AUTH_HEADER_RE = /^(Bearer|Basic)\s+[A-Za-z0-9+/=._~-]{8,}$/i;

function truncateString(value: string, limit: number = SANITIZE_LIMITS.maxStringLen): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…[обрезано]`;
}

/** Похожа ли строка на секрет по СОДЕРЖИМОМУ (независимо от ключа). */
export function looksLikeSecretValue(value: string): boolean {
  return TELEGRAM_TOKEN_RE.test(value.trim()) || AUTH_HEADER_RE.test(value.trim());
}

const TELEGRAM_TOKEN_EMBEDDED_RE = /\b\d{1,20}:[A-Za-z0-9_-]{16,}\b/g;
const AUTH_EMBEDDED_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9+/=._~-]{8,}/gi;

function sanitizeString(value: string): string {
  if (looksLikeSecretValue(value)) return REDACTED;
  // Токен/авторизация могут оказаться внутри более длинной строки
  // (например, в сообщении об ошибке) — вычищаем и такие вхождения.
  const cleaned = value.replace(TELEGRAM_TOKEN_EMBEDDED_RE, REDACTED).replace(AUTH_EMBEDDED_RE, REDACTED);
  return truncateString(cleaned);
}

/**
 * Рекурсивная санитизация произвольного значения.
 * Возвращает безопасную копию: примитивы, массивы и простые объекты;
 * функции и символы заменяются маркерами; циклы не зацикливают.
 */
export function sanitizeValue(value: unknown, depth = 0, seen?: WeakSet<object>): unknown {
  const visited = seen ?? new WeakSet<object>();

  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return value;
  if (typeof value === 'function' || typeof value === 'symbol') return '[Не сериализуется]';

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    // Стек сознательно не сохраняем: в нём могут быть секреты.
    return {
      __error: true,
      name: value.name,
      message: typeof value.message === 'string' ? sanitizeString(value.message) : REDACTED,
    };
  }

  if (depth >= SANITIZE_LIMITS.maxDepth) return '[ВЛОЖЕННОСТЬ ОБРЕЗАНА]';

  if (typeof value === 'object') {
    if (visited.has(value)) return '[ЦИКЛИЧЕСКАЯ ССЫЛКА]';
    visited.add(value);

    if (Array.isArray(value)) {
      const limited = value.slice(0, SANITIZE_LIMITS.maxArrayItems);
      const result = limited.map((item) => sanitizeValue(item, depth + 1, visited));
      if (value.length > SANITIZE_LIMITS.maxArrayItems) {
        result.push(`[… ещё ${value.length - SANITIZE_LIMITS.maxArrayItems} элементов]`);
      }
      return result;
    }

    const entries = Object.entries(value as Record<string, unknown>);
    const result: Record<string, unknown> = {};
    let taken = 0;
    for (const [key, entry] of entries) {
      if (taken >= SANITIZE_LIMITS.maxObjectKeys) {
        result['__обрезано__'] = `ещё ${entries.length - taken} ключей`;
        break;
      }
      if (SENSITIVE_KEY_RE.test(key)) {
        result[key] = REDACTED;
      } else {
        result[key] = sanitizeValue(entry, depth + 1, visited);
      }
      taken += 1;
    }
    return result;
  }
  return REDACTED;
}

function toBytes(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/** Сериализует санитизированное значение в строку-сводку с лимитом. */
export function summarize(value: unknown, maxBytes = SANITIZE_LIMITS.summaryMaxBytes): string {
  let text: string;
  try {
    text = JSON.stringify(sanitizeValue(value));
  } catch {
    text = JSON.stringify(REDACTED);
  }
  if (text === undefined) text = 'null';
  while (toBytes(text) > maxBytes) {
    text = truncateString(text, Math.max(64, Math.floor(text.length * 0.75)));
  }
  return text;
}

/** Сводка метаданных аудита (отдельный лимит размера). */
export function summarizeAuditMetadata(metadata: unknown): string {
  return summarize(metadata, SANITIZE_LIMITS.auditMetadataMaxBytes);
}
