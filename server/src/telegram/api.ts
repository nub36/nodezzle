/**
 * Транспорт Telegram Bot API (подэтап 5.8C).
 *
 * Изолированный серверный клиент: только он знает токен бота (берёт
 * расшифрованное значение из Secrets Vault, наружу его не отдаёт).
 *
 * Защита:
 *  - базовый адрес фиксирован (официальный домен или локальный тестовый
 *    стенд) — пользовательские адреса не принимаются (нет SSRF);
 *  - токен не включается ни в сообщения об ошибках, ни в журналы;
 *  - таймаут через AbortSignal;
 *  - ошибки Telegram нормализуются в `TelegramApiError`.
 */

const PROD_BASE_URL = 'https://api.telegram.org';

export class TelegramApiError extends Error {
  /** Метод, при вызове которого произошла ошибка. */
  readonly method: string;
  /** HTTP-статус, если ответ пришёл. */
  readonly status?: number;

  constructor(method: string, message: string, status?: number) {
    super(message);
    this.name = 'TelegramApiError';
    this.method = method;
    this.status = status;
  }
}

export interface TelegramTransportOptions {
  /** Расшифрованный токен бота (из Secrets Vault). */
  token: string;
  /** Таймаут одного запроса, мс (по умолчанию 10 000). */
  timeoutMs?: number;
  /** Подмена сетевого слоя (тесты — только моки, реальных запросов нет). */
  fetchImpl?: typeof fetch;
  /**
   * Базовый адрес: либо официальный домен, либо локальный стенд
   * `http://127.0.0.1:<порт>` для тестов. Любой другой адрес
   * отклоняется — защита от SSRF.
   */
  baseUrl?: string;
}

export interface TelegramTransport {
  getMe(): Promise<{ id: number; username?: string; firstName?: string }>;
  sendMessage(params: { chatId: number | string; text: string }): Promise<{ messageId: number }>;
  sendPhoto(params: { chatId: number | string; photo: string; caption?: string }): Promise<{ messageId: number }>;
  editMessageText(params: { chatId: number | string; messageId: number; text: string }): Promise<boolean>;
  deleteMessage(params: { chatId: number | string; messageId: number }): Promise<boolean>;
  answerCallbackQuery(params: { callbackQueryId: string; text?: string; showAlert?: boolean }): Promise<boolean>;
  /** Регистрация вебхука (только публичный HTTPS-адрес). */
  setWebhook(params: { url: string; secretToken?: string }): Promise<boolean>;
  getWebhookInfo(): Promise<{ url: string; pendingUpdateCount: number; lastErrorDate?: number }>;
  deleteWebhook(): Promise<boolean>;
}

function assertSafeBaseUrl(baseUrl: string): string {
  if (baseUrl === PROD_BASE_URL) return baseUrl;
  if (/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(baseUrl)) return baseUrl;
  throw new Error('Недопустимый базовый адрес Telegram API');
}

export function createTelegramApi(options: TelegramTransportOptions): TelegramTransport {
  const baseUrl = assertSafeBaseUrl(options.baseUrl ?? PROD_BASE_URL);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const fetchImpl = options.fetchImpl ?? fetch;

  async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      // Токен обязателен в пути запроса (протокол Bot API);
      // URL с токеном нигде не логируется.
      response = await fetchImpl(`${baseUrl}/bot${options.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      throw new TelegramApiError(
        method,
        aborted ? 'Превышен лимит времени запроса к Telegram' : 'Сбой сети при запросе к Telegram',
      );
    }
    let payload: { ok?: boolean; result?: T; description?: string };
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      throw new TelegramApiError(method, `Telegram вернул некорректный ответ (статус ${response.status})`, response.status);
    }
    if (!response.ok || payload.ok !== true) {
      // Описание ошибки от Telegram безопасно: токена в нём нет,
      // но на всякий случай строим сообщение из описания и статуса.
      const description = typeof payload.description === 'string' ? payload.description : 'Запрос отклонён';
      throw new TelegramApiError(method, description, response.status);
    }
    return payload.result as T;
  }

  return {
    async getMe() {
      const result = await call<{ id: number; username?: string; first_name?: string }>('getMe', {});
      return { id: result.id, username: result.username, firstName: result.first_name };
    },
    async sendMessage({ chatId, text }) {
      const result = await call<{ message_id: number }>('sendMessage', { chat_id: chatId, text });
      return { messageId: result.message_id };
    },
    async sendPhoto({ chatId, photo, caption }) {
      const result = await call<{ message_id: number }>('sendPhoto', {
        chat_id: chatId,
        photo,
        ...(caption !== undefined ? { caption } : {}),
      });
      return { messageId: result.message_id };
    },
    async editMessageText({ chatId, messageId, text }) {
      await call<unknown>('editMessageText', { chat_id: chatId, message_id: messageId, text });
      return true;
    },
    async deleteMessage({ chatId, messageId }) {
      await call<unknown>('deleteMessage', { chat_id: chatId, message_id: messageId });
      return true;
    },
    async answerCallbackQuery({ callbackQueryId, text, showAlert }) {
      await call<unknown>('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        ...(showAlert !== undefined ? { show_alert: showAlert } : {}),
        ...(text !== undefined ? { text } : {}),
      });
      return true;
    },
    async setWebhook({ url, secretToken }) {
      await call<unknown>('setWebhook', {
        url,
        ...(secretToken !== undefined ? { secret_token: secretToken } : {}),
      });
      return true;
    },
    async getWebhookInfo() {
      const result = await call<{ url?: string; pending_update_count?: number; last_error_date?: number }>(
        'getWebhookInfo',
        {},
      );
      return {
        url: result.url ?? '',
        pendingUpdateCount: result.pending_update_count ?? 0,
        ...(result.last_error_date !== undefined ? { lastErrorDate: result.last_error_date } : {}),
      };
    },
    async deleteWebhook() {
      await call<unknown>('deleteWebhook', {});
      return true;
    },
  };
}
