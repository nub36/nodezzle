# NODEZZLE — Блоки (детали)

## Архитектура блоков

Каждый блок описывается **Block Definition** (`src/core/types/blocks.ts`) и регистрируется в **BlockRegistry** (`src/core/registry/block-registry.ts`). Ядро Canvas, runtime и UI знают только реестр — конкретные блоки им «неизвестны».

```ts
blockRegistry.register({
  id: 'telegram.send_message',
  labelKey: 'blocks.telegram.send_message.label',   // «Отправить сообщение»
  category: 'telegram',
  inputs:  [dport('text', 'blocks.ports.text', 'text'), dport('chat_id', 'blocks.ports.chat_id', 'number')],
  outputs: [dport('message_id', 'blocks.ports.message_id', 'number'), eport()],
  defaults: {},
  runtime: async ({ inputs, runtime }) => {
    const chatId = Number(inputs.chat_id);
    const messageId = await runtime.telegram.send({ chatId, text: String(inputs.text) });
    return { outputs: { message_id: messageId } };
  },
});
```

**Ключевые свойства дефиниции:**

| Поле | Назначение |
|---|---|
| `id` | Устойчивый технический идентификатор `<category>.<name>` (англ.) |
| `labelKey` / `descriptionKey` | i18n-ключи русского названия/описания |
| `category` | Категория палитры (ядро, логика, telegram, …) |
| `trigger` | Точка входа схемы (триггер платформы): «Получено сообщение», «Команда», «Страница» |
| `entry` | Точка входа ВНУТРИ модели: «Вход модели» |
| `available: false` | Зарезервировано архитектурно, runtime не реализован — скрыто из палитры |
| `inputs/outputs` | Порты (INPUT/OUTPUT): kind `data`/`event`/`error` + тип |
| `defaults` | Начальные значения конфигурации экземпляра |
| `matches` | Проверка применимости триггера к payload (напр. команда `/start`) |
| `runtime` | Обработчик выполнения (чистая функция + контекст) |
| `keywords` | Ключевые слова поиска в библиотеке (рус/англ; не показываются пользователю). Этап 2, подэтап A |
| `difficulty` | `basic` (режим «Основные» библиотеки) или `advanced` (только «Все»). Этап 2, подэтап A |

**Контекст выполнения** (`NodeExecutionContext`): `inputs` (значения входов), `config` (конфигурация экземпляра), `payload` (событие запуска), `runtime` (логирование, telegram-адаптер, модели, executeModel, отмена).

**Результат** (`NodeHandlerResult`): `outputs` (значения выходов) или `error` (код ошибки, ключ `errors.*` в i18n).

## Система типов

Базовые типы портов: `any · text · number · boolean · json · object · array · file · image · user · date · url · secret · telegram_message · event · error`.

Пользовательские типы — через `TypeRegistry` (`src/core/types/ports.ts`):

```ts
typeRegistry.register({
  id: 'order_ref',
  labelKey: 'portTypes.order_ref',
  compatibleWith: ['text', 'any'],  // в какие базовые типы можно «лить»
});
```

Совместимость портов (умные соединения) — `src/core/type-system/compatibility.ts`:
`error ↔ error`, `event ↔ event`, data: `any` со всем, иначе равенство типов. Превращение между типами — через Converter-блоки.

## Список блоков

Зарегистрировано **25** деталей: 18 в палитре, 6 зарезервированных
(`available: false`) и 1 служебная — стикер-заметка (`note.sticky`,
в палитре не показывается, вставляется через контекстное меню; в выполнении
не участвует — см. Этап 2, подэтап F). Список ниже описывает фундамент (Этап 0).

### Ядро (core) ✅
| Блок | ID | Порты | Назначение |
|---|---|---|---|
| Текст | `core.text` | → Текст | Константа (config: `value`) |
| Число | `core.number` | → Число | Константа числа |
| JSON | `core.json` | → JSON | Константа JSON |
| Вход модели | `core.input` | → Любой (entry) | Берёт значение из контракта модели (config: `portId`) |
| Выход модели | `core.output` | ← Любой | Пишет значение в контракт модели (config: `portId`) |

### Данные / Конвертеры (data) ✅
| Блок | ID | Связь |
|---|---|---|
| Текст → Число | `data.text_to_number` | Текст → Число (+Error) |
| Число → Текст | `data.number_to_text` | Число → Текст (+Error) |
| Текст → Логическое | `data.text_to_boolean` | Текст → Boolean (+Error) |
| Текст → JSON | `data.text_to_json` | Текст → JSON (+Error) |
| JSON → Текст | `data.json_to_text` | JSON → Текст (+Error) |
| В объект | `data.to_object` | Любой → Объект (config: `key`) |
| Из объекта | `data.from_object` | Объект → Любой (config: `key`, +Error) |

### Логика (logic) ✅
| Блок | ID | Описание |
|---|---|---|
| Условие | `logic.condition` | Любой → «Да»/«Нет». Операторы: Равно, Не равно, Содержит, Не содержит, Пустое, Не пустое, Больше, Меньше. Config: `operator`, `target`, `trueValue`, `falseValue` (значения веток) |
| Переключатель | `logic.switch` | Любой → Случай 1..3 / Иначе (config: значения случаев) |

### Поток (flow) ✅
| Блок | ID | Описание |
|---|---|---|
| Задержка | `flow.delay` | Любой → Любой; config `delayMs` (0..60000); поддерживает отмену |

### Telegram (telegram) ✅ (отправки — симуляция)
| Блок | ID | Тип | Порты |
|---|---|---|---|
| Получено сообщение | `telegram.message_received` | триггер | → Текст, ID пользователя, ID чата, Имя, TelegramMessage |
| Команда | `telegram.command` | триггер (config: `command`) | → Команда, Аргументы, ID пользователя, ID чата |
| Отправить сообщение | `telegram.send_message` | действие | ← Текст, ID чата → ID сообщения (+Error) |
| Отправить фото | `telegram.send_photo` | действие | ← Фото (image), Подпись, ID чата → ID сообщения (+Error) |

### Web (web) ✅ (события — симуляция)
| Блок | ID | Событие |
|---|---|---|
| Страница | `web.page` | Загрузка страницы (→ Данные) |
| Кнопка | `web.button` | Нажатие кнопки (→ Данные) |
| Форма | `web.form` | Отправка формы (→ Данные) |

### Модели (models) ✅
| Блок | ID | Описание |
|---|---|---|
| Вызов модели | `models.call` | ← Данные (объект) → Результат (объект, +Error). Config: `modelId`. Маппинг входного объекта на контракт модели, результат — собранные OUTPUT |

### Отладка (debug) ✅
| Блок | ID | Описание |
|---|---|---|
| Лог | `debug.log` | ← Любой → Любой (passthrough); config `label`; пишет в журнал выполнения |

### Дата и время (datetime) ✅
| Блок | ID | Описание |
|---|---|---|
| Текущее время | `datetime.now` | → Дата (ISO 8601) |

### Зарезервировано (available: false) ⏳
| Блок | ID | Планируется |
|---|---|---|
| Переменная | `memory.variable` | Этап 4 (переменные проекта) |
| Общее хранилище | `memory.shared` | SHARED MEMORY (этап 5) |
| Обработчик ошибок | `error.handle` | Этап 2 (error-связи UI) |
| Отправить событие | `event.send` | SEND EVENT (этап 5) |
| Получить событие | `event.receive` | RECEIVE EVENT (этап 5) |
| HTTP-запрос | `http.request` | Внешние API (этап 5) |
| AI: запрос | `ai.text` | AI-генерация (этап 5) |

## Как добавить новый блок

1. Создать дефиницию в `src/blocks/<category>/blocks.ts` (или новый файл-категорию).
2. Зарегистрировать в `src/blocks/index.ts` (массив `ALL_BLOCKS`).
3. Добавить i18n-ключи в `src/i18n/locales/ru.json`: `blocks.<id>.label`, `blocks.<id>.description`, новые порты — `blocks.ports.*`, параметры — `blocks.config.*`.
4. Добавить unit-тест (runtime/поведение) — `src/core/runtime/*.test.ts` или рядом с блоком.
5. Обновить этот документ (таблицу) и CHANGELOG.md.

Ядро не менять: Canvas, палитра, inspector, runtime подхватывают блок автоматически.

## Правила

- Один блок — одна ответственность.
- Конвертация типов — только Converter-блоками (никаких «тихих» кастов в runtime).
- Ошибки — кодом `ERR_*` (текст — i18n `errors.*`), не throw «налево».
- `runtime` — чистый код без обращения к DOM/React.
- Названия для пользователя — русские, технические id — английские.
