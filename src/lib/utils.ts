/** Мелкие утилиты UI. */

import i18n from 'i18next';

/** Объединение классов CSS. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Форматирование даты «13 сент., 12:40» (ru-RU). */
export function formatDateRu(ts: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

/** Время «12:40:01.123» для журнала выполнения. */
export function formatTimeRu(ts: number): string {
  const d = new Date(ts);
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(
    d.getSeconds(),
  ).padStart(2, '0')}.${ms}`;
}

/** Безопасный JSON.stringify для журнала (циклы, undefined). */
export function safeStringify(value: unknown, indent = 2): string {
  const seen = new WeakSet();
  try {
    return JSON.stringify(
      value,
      (_key, val) => {
        if (typeof val === 'bigint') return val.toString();
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) return '[cycle]';
          seen.add(val);
        }
        return val;
      },
      indent,
    );
  } catch {
    return String(value);
  }
}

/** Перевод строки/кода ошибки в человекочитаемое сообщение (ru-RU). */
export function translateError(code?: string): string {
  if (!code) return i18n.t('errors.ERR_RUNTIME');
  const key = `errors.${code}`;
  const translated = i18n.t(key);
  return translated === key ? code : translated;
}

/** try/catch JSON.parse → фолбэк. */
export function tryParseJson(value: string, fallback: unknown): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
