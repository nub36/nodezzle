# NODEZZLE — Telegram Layer

Telegram — первое основное направление NODEZZLE. Слой построен **поверх общего ядра**: Telegram-блоки — обычные Block Definitions с категорией `telegram`; транспорт (Bot API) изолирован в runtime-адаптере `runtime.telegram`.

## Блоки Telegram (Этап 0)

| Блок | ID | Тип | Порты |
|---|---|---|---|
| Получено сообщение | `telegram.message_received` | триггер | → Текст, ID пользователя, ID чата, Имя, TelegramMessage |
| Команда | `telegram.command` | триггер (config: `command`, напр. `/start`) | → Команда, Аргументы, ID пользователя, ID чата |
| Отправить сообщение | `telegram.send_message` | действие | ← Текст, ID чата → ID сообщения (+Error) |
| Отправить фото | `telegram.send_photo` | действие | ← Фото (image), Подпись, ID чата → ID сообщения (+Error) |

Планируются (ROADMAP этап 1–2): Telegram Bot (конфигурация), Callback Query, Answer Callback, Get User, Get Chat, Inline Keyboard, Edit Message, Send Document, Send File, Delete Message.

## События и порты

Telegram-событие потенциально содержит:

```
message, text, user, user_id, username, chat, chat_id,
photo, document, voice, video, location, callback, command
```

Не всё отдаётся сразу — **архитектура позволяет расширять набор портов** без изменения ядра: порт = запись в `PortDefinition` + i18n-ключ. Правило: порты события — с типами (`telegram_message`, `text`, `number`, `user`, `image`…), чтобы умные соединения работали.

## Пример схемы (демо-проект)

```
Получено сообщение ──→ В объект (text) ──→ Вызов модели «Приветствие»
      │                                            │
      │ (chat_id)                     (result: reply)
      │                                            ↓
Отправить сообщение ←── Из объекта (reply) ←──────┘
```

Модель «Приветствие» (контракт: `text → reply`):

```
Вход (text) → Условие (содержит «привет»?) → Выход (reply)
```

Это демо загружается с Dashboard: «Загрузить пример: Telegram-бот». Запуск — через Симулятор (Debug-панель): payload `{text, chat_id, user_id, command?}`.

## Как запускается схема (сейчас и в будущем)

**Сейчас (Этап 0, симуляция):**
- Отправки (`send_message`, `send_photo`) идут в **outbox** — виртуальный журнал, видимый в Debug-панели («Чат Telegram») и демо-чате главной страницы.
- Входящие события создаёт Симулятор (настраиваемый payload).
- Реального Telegram-токена во frontend **нет и не будет**.

**В будущем (ROADMAP этап 2):**
- Backend NODEZZLE: webhook Telegram Bot API → создание `TriggerPayload` → `executeCanvas` (тот же runtime) → отправка через Bot API (токен из `.env` сервера) → результат в outbox/историю.
- Frontend-адаптер заменяется на вызовы API; блоки и схемы не меняются.

## Безопасность

- **Telegram Bot Token хранится только на backend** (`.env` сервера), никогда не коммитится, не передаётся во frontend.
- В репозитории только `.env.example` с фиктивным значением `NODEZZLE_TELEGRAM_BOT_TOKEN=123456:EXAMPLE-FIXTURE-DO-NOT-USE`.
- Платформенные правила: никаких реальных credentials в UI, в формате проекта, в логах.
- Входящие сообщения проходят валидацию (Zod), payload нормализуется runtime'ом.
