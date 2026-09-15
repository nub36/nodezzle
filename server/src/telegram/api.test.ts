/** Транспорт Bot API: только моки — реальные запросы в тестах запрещены. */

import { describe, expect, it } from 'vitest';
import { createTelegramApi } from './api.ts';

const TOKEN = '123456:СекретныйТокенТестов';

interface RecordedCall {
  method: string; // имя метода в пути, без токена
  body: Record<string, unknown>;
}

function mockFetch(handler: (call: RecordedCall) => Response | Promise<Response>): {
  fetchImpl: typeof fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (!url.includes(TOKEN)) throw new Error('URL обязан содержать токен бота (протокол Bot API)');
    // В записи сохраняем только имя метода — без токена.
    const match = /\/bot[^/]+\/([^/?]+)/.exec(url);
    calls.push({ method: match ? match[1] : '', body: JSON.parse(String(init?.body ?? '{}')) });
    return handler(calls[calls.length - 1]);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const okJson = (result: unknown) => new Response(JSON.stringify({ ok: true, result }), { status: 200 });

describe('createTelegramApi', () => {
  it('sendMessage: верный метод, тело и разбор ответа', async () => {
    const { fetchImpl, calls } = mockFetch(() => okJson({ message_id: 501 }));
    const api = createTelegramApi({ token: TOKEN, fetchImpl });
    const res = await api.sendMessage({ chatId: 42, text: 'Привет' });
    expect(res.messageId).toBe(501);
    expect(calls[0].method).toBe('sendMessage');
    expect(calls[0].body).toEqual({ chat_id: 42, text: 'Привет' });
  });

  it('sendPhoto передаёт подпись; editMessageText и deleteMessage вызывают свои методы', async () => {
    const { fetchImpl, calls } = mockFetch(() => okJson({ message_id: 7 }));
    const api = createTelegramApi({ token: TOKEN, fetchImpl });
    const photo = await api.sendPhoto({ chatId: 1, photo: 'https://example.ru/x.png', caption: 'Фото' });
    expect(photo.messageId).toBe(7);
    expect(await api.editMessageText({ chatId: 1, messageId: 7, text: 'Исправлено' })).toBe(true);
    expect(await api.deleteMessage({ chatId: 1, messageId: 7 })).toBe(true);
    expect(await api.answerCallbackQuery({ callbackQueryId: 'cq-1', text: 'ок' })).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(['sendPhoto', 'editMessageText', 'deleteMessage', 'answerCallbackQuery']);
    expect(calls[0].body).toEqual({ chat_id: 1, photo: 'https://example.ru/x.png', caption: 'Фото' });
  });

  it('getMe возвращает имя и ник бота', async () => {
    const { fetchImpl } = mockFetch(() => okJson({ id: 9000, username: 'nodezzle_test_bot', first_name: 'Тест' }));
    const api = createTelegramApi({ token: TOKEN, fetchImpl });
    expect(await api.getMe()).toEqual({ id: 9000, username: 'nodezzle_test_bot', firstName: 'Тест' });
  });

  it('ошибка Telegram — TelegramApiError с описанием, токен не утекает', async () => {
    const { fetchImpl } = mockFetch(
      () => new Response(JSON.stringify({ ok: false, description: 'Unauthorized: bot token invalid' }), { status: 401 }),
    );
    const api = createTelegramApi({ token: TOKEN, fetchImpl });
    await expect(api.sendMessage({ chatId: 1, text: 'x' })).rejects.toMatchObject({
      name: 'TelegramApiError',
      message: 'Unauthorized: bot token invalid',
      status: 401,
    });
    try {
      await api.sendMessage({ chatId: 1, text: 'x' });
      expect.unreachable();
    } catch (err) {
      expect(JSON.stringify({ m: (err as Error).message, n: (err as Error).name })).not.toContain('СекретныйТокенТестов');
    }
  });

  it('таймаут запроса превращается в понятную ошибку', async () => {
    const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    }) as typeof fetch;
    const api = createTelegramApi({ token: TOKEN, fetchImpl, timeoutMs: 30 });
    await expect(api.getMe()).rejects.toMatchObject({
      name: 'TelegramApiError',
      message: 'Превышен лимит времени запроса к Telegram',
    });
  });

  it('сетевой сбой — ошибка без деталей внутренней реализации', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED internal detail');
    }) as typeof fetch;
    const api = createTelegramApi({ token: TOKEN, fetchImpl });
    await expect(api.getMe()).rejects.toMatchObject({
      name: 'TelegramApiError',
      message: 'Сбой сети при запросе к Telegram',
    });
  });

  it('защита от SSRF: принимаются только официальный домен и локальный стенд', () => {
    expect(() => createTelegramApi({ token: TOKEN, baseUrl: 'https://evil.example' })).toThrow(/Недопустимый базовый адрес/);
    expect(() => createTelegramApi({ token: TOKEN, baseUrl: 'http://10.0.0.5:8080' })).toThrow(/Недопустимый базовый адрес/);
    expect(() => createTelegramApi({ token: TOKEN, baseUrl: 'https://api.telegram.org' })).not.toThrow();
    expect(() => createTelegramApi({ token: TOKEN, baseUrl: 'http://127.0.0.1:8443' })).not.toThrow();
  });

  it('некорректный ответ (не JSON) — ошибка со статусом', async () => {
    const fetchImpl = (async () => new Response('html-musor', { status: 502 })) as typeof fetch;
    const api = createTelegramApi({ token: TOKEN, fetchImpl });
    await expect(api.getMe()).rejects.toMatchObject({ name: 'TelegramApiError', status: 502 });
  });
});


it('answerCallbackQuery: show_alert true/false и пустой текст не теряются', async () => {
  const { fetchImpl, calls } = mockFetch(() => okJson(true));
  const api = createTelegramApi({ token: TOKEN, fetchImpl });
  await api.answerCallbackQuery({ callbackQueryId: 'cb-1', text: '', showAlert: false });
  await api.answerCallbackQuery({ callbackQueryId: 'cb-2', text: 'Ответ', showAlert: true });
  expect(calls).toEqual([
    { method: 'answerCallbackQuery', body: { callback_query_id: 'cb-1', text: '', show_alert: false } },
    { method: 'answerCallbackQuery', body: { callback_query_id: 'cb-2', text: 'Ответ', show_alert: true } },
  ]);
});

it('09C2: клавиатура становится reply_markup; старое тело запроса неизменно, ошибки до fetch', async () => {
  const { fetchImpl, calls } = mockFetch(() => okJson({ message_id: 321 }));
  const api = createTelegramApi({ token: TOKEN, fetchImpl });
  const keyboard = { inline_keyboard: [[{ text: 'Да', callback_data: 'confirm' }]] };
  expect(await api.sendMessage({ chatId: 42, text: 'Выберите', keyboard })).toEqual({ messageId: 321 });
  expect(calls[0]).toEqual({ method: 'sendMessage', body: { chat_id: 42, text: 'Выберите', reply_markup: keyboard } });
  await api.sendMessage({ chatId: 42, text: 'Без кнопок' });
  expect(calls[1].body).toEqual({ chat_id: 42, text: 'Без кнопок' });
  await expect(api.sendMessage({ chatId: 42, text: 'Не отправлять', keyboard: { inline_keyboard: [] } })).rejects.toMatchObject({ message: 'ERR_TELEGRAM_KEYBOARD' });
  expect(calls).toHaveLength(2);
});
