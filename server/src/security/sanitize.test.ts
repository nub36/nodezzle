/** Санитайзер журналов: секреты не должны попадать в сводки. */

import { describe, expect, it } from 'vitest';
import { REDACTED, sanitizeValue, summarize, summarizeAuditMetadata, looksLikeSecretValue } from './sanitize.ts';

const TG_TOKEN = '123456789:AAEhBP0avF9YqQx6K3n1Q7u8Jv0w2X4y5zA';

describe('Чувствительные ключи (по имени поля)', () => {
  it('маскирует вложенные секреты независимо от глубины', () => {
    const data = {
      config: {
        telegram: { bot_token: TG_TOKEN },
        db: { DATABASE_URL: 'postgres://user:pass@host/db' },
        headers: { authorization: 'Bearer abcd1234efgh5678', cookie: 'session=abc123' },
        credentials: { password: 'Пароль12345', apiKey: 'sk-test', api_key: 'sk-test' },
        webhook_secret: 'whsec_123',
      },
    };
    const clean = sanitizeValue(data) as Record<string, unknown>;
    const json = JSON.stringify(clean);
    expect(json).not.toContain(TG_TOKEN);
    expect(json).not.toContain('Пароль12345');
    expect(json).not.toContain('postgres://');
    expect(json).not.toContain('Bearer abcd');
    expect(json).not.toContain('session=abc');
    expect(json).not.toContain('sk-test');
    expect(json).not.toContain('whsec_123');
    const cfg = (clean.config as Record<string, Record<string, unknown>>);
    expect(cfg.telegram.bot_token).toBe(REDACTED);
    expect(cfg.headers.authorization).toBe(REDACTED);
  });
});

describe('Чувствительные значения (по содержимому)', () => {
  it('маскирует токен и заголовки, даже если ключ безобидный', () => {
    const data = { note: TG_TOKEN, header: 'Basic dXNlcjpwYXNzMTIzNA', text: 'обычный текст' };
    const clean = sanitizeValue(data) as Record<string, unknown>;
    expect(clean.note).toBe(REDACTED);
    expect(clean.header).toBe(REDACTED);
    expect(clean.text).toBe('обычный текст');
  });

  it('looksLikeSecretValue различает токен, авторизацию и текст', () => {
    expect(looksLikeSecretValue(TG_TOKEN)).toBe(true);
    expect(looksLikeSecretValue('Bearer abcdef1234567890')).toBe(true);
    expect(looksLikeSecretValue('привет мир')).toBe(false);
  });
});

describe('Секреты в массивах', () => {
  it('маскирует токен внутри массива значений', () => {
    const data = { values: ['раз', TG_TOKEN, { token: 'любой' }] };
    const clean = JSON.stringify(sanitizeValue(data));
    expect(clean).not.toContain(TG_TOKEN);
    expect(clean).toContain('раз');
    expect(clean).toContain(REDACTED);
  });
});

describe('Лимиты', () => {
  it('огромный массив обрезается с пометкой', () => {
    const big = Array.from({ length: 5000 }, (_, i) => i);
    const clean = sanitizeValue(big) as unknown[];
    expect(clean.length).toBeLessThanOrEqual(42);
    expect(JSON.stringify(clean)).toContain('элементов');
  });

  it('объект с тысячами ключей обрезается', () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 500; i += 1) obj[`k${i}`] = i;
    const clean = JSON.stringify(sanitizeValue(obj));
    expect(clean).toContain('__обрезано__');
  });

  it('очень глубокий JSON не роняет санитайзер', () => {
    let deep: unknown = { token: TG_TOKEN };
    for (let i = 0; i < 50; i += 1) deep = { nested: deep };
    const clean = sanitizeValue(deep);
    expect(JSON.stringify(clean)).not.toContain(TG_TOKEN);
    expect(JSON.stringify(clean)).toContain('ВЛОЖЕННОСТЬ ОБРЕЗАНА');
  });

  it('сводка ограничена по байтам', () => {
    const huge = { data: 'x'.repeat(50_000) };
    const text = summarize(huge);
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(2048);
  });

  it('длинные строки укорачиваются', () => {
    const clean = sanitizeValue('y'.repeat(10_000)) as string;
    expect(clean.length).toBeLessThan(500);
  });
});

describe('Особые значения', () => {
  it('циклический объект не ломает санитайзер', () => {
    const a: Record<string, unknown> = { name: 'узел' };
    a.self = a;
    const clean = JSON.stringify(sanitizeValue(a));
    expect(clean).toContain('ЦИКЛИЧЕСКАЯ ССЫЛКА');
    expect(clean).toContain('узел');
  });

  it('Error сериализуется без стека; секреты в сообщении маскируются', () => {
    const err = new Error(`сбой с токеном ${TG_TOKEN}`);
    const clean = sanitizeValue(err) as Record<string, unknown>;
    expect(clean.__error).toBe(true);
    expect(JSON.stringify(clean)).not.toContain(TG_TOKEN);
    expect(JSON.stringify(clean)).not.toContain('at ');
  });

  it('функции, символы, undefined и unknown безопасны', () => {
    expect(sanitizeValue(() => 1)).toBe('[Не сериализуется]');
    expect(sanitizeValue(Symbol('s'))).toBe('[Не сериализуется]');
    expect(sanitizeValue(undefined)).toBeNull();
    expect(sanitizeValue(NaN)).toBeNaN();
  });
});

describe('Метаданные аудита', () => {
  it('проходят через санитайзер и лимит размера', () => {
    const meta = {
      token: TG_TOKEN,
      password: 'x',
      ok: true,
      junk: 'z'.repeat(20_000),
    };
    const text = summarizeAuditMetadata(meta);
    expect(text).not.toContain(TG_TOKEN);
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(2048);
    expect(text).toContain('"ok":true');
  });
});
