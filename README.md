# NODEZZLE

**NODE + PUZZLE.** Визуальная среда, в которой пользователь собирает работающие Telegram-боты, веб-интерфейсы, модули, модели и целые системы — из соединяемых деталей.

> **Не программируй. Собери.**
> Для Telegram: *«Не программируй бота. Собери его.»*

NODEZZLE — это цифровой конструктор (Puzzle / LEGO) для программных систем. Каждая деталь имеет типизированные INPUT/OUTPUT, детали соединяются в логику, логика упаковывается в модели, модели — в готовые системы.

---

## Статус

**Этап 0 — технический фундамент** (см. [docs/ROADMAP.md](docs/ROADMAP.md)):

- ✅ Ядро: Block Definition, реестр блоков, система типов портов, правила совместимости
- ✅ Runtime: живое выполнение схем (IDLE → RUNNING → SUCCESS/ERROR/STOPPED), модели внутри моделей
- ✅ Canvas: React Flow — drag & drop, зум, minimap, undo/redo, умные соединения
- ✅ 24 детали: Ядро, Логика, Данные (конвертеры), Поток, Telegram, Web, Модели, Отладка, Дата и время
- ✅ Формат проекта (v1) + автосохранение (LocalStorage)
- ✅ Инициативный Russian-first UI (ru-RU), i18n-архитектура
- ✅ Демонстрационный проект: `Telegram → Модель «Приветствие» → Telegram`
- ✅ Тесты ядра: 34 unit-теста

## Быстрый старт

Требования: **Node.js ≥ 20.19**.

```bash
npm install        # зависимости
npm run dev        # dev-сервер (http://localhost:5173)
npm test           # unit-тесты ядра (Vitest)
npm run typecheck  # проверка типов (TypeScript)
npm run build      # production-сборка
```

На главной странице есть **Playground** — интерактивная демонстрация принципа без регистрации. На Dashboard можно загрузить готовый пример: *«Загрузить пример: Telegram-бот»*.

## Структура проекта

```
nodezzle/
├── AGENTS.md              # правила работы AI-агентов (читать первым!)
├── CHANGELOG.md           # журнал изменений
├── .env.example           # переменные окружения (без реальных секретов)
├── docs/                  # документация (русский язык)
│   ├── CONCEPT.md         # концепция продукта
│   ├── ARCHITECTURE.md    # архитектура системы
│   ├── BLOCKS.md          # архитектура и список блоков
│   ├── MODELS.md          # модели, контракты, вложенность
│   ├── TELEGRAM.md        # Telegram Layer
│   ├── WEB.md             # Web Layer
│   ├── UI.md              # визуальный стиль и экраны
│   ├── PROJECT_FORMAT.md  # формат хранения проекта (v1)
│   ├── ROADMAP.md         # этапы развития
│   ├── IDEAS.md           # экспериментальные идеи
│   └── DECISIONS.md       # архитектурные решения (ADR)
└── src/
    ├── core/              # ядро (без React): типы, реестр, runtime, формат
    │   ├── types/         #   PortDefinition, BlockDefinition, runtime-типы
    │   ├── type-system/   #   совместимость INPUT/OUTPUT
    │   ├── registry/      #   BlockRegistry
    │   ├── project/       #   Zod-схема формата, сериализация, хранилище
    │   └── runtime/       #   executeCanvas — движок выполнения
    ├── blocks/            # дефиниции блоков по категориям
    ├── features/          # экраны: landing, dashboard, canvas
    ├── store/             # Zustand: проект (undo/redo, autosave), выполнение
    ├── i18n/              # локализация (ru)
    ├── demo/              # демонстрационный проект
    └── styles/            # дизайн-токены и визуальные эффекты
```

## Документация

| Документ | О чём |
|---|---|
| [docs/CONCEPT.md](docs/CONCEPT.md) | Философия, иерархия «деталь → система», MVP-направления |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Слойность, расширяемость, производительность, безопасность |
| [docs/BLOCKS.md](docs/BLOCKS.md) | Block Definition, реестр, список блоков, как добавить блок |
| [docs/MODELS.md](docs/MODELS.md) | Контракты, Drill Down, модель внутри модели, взаимодействие |
| [docs/TELEGRAM.md](docs/TELEGRAM.md) | Telegram-блоки, порты события, симуляция → Bot API |
| [docs/WEB.md](docs/WEB.md) | Web-элементы, события, Telegram + Web |
| [docs/UI.md](docs/UI.md) | Premium Dark UI, состояния выполнения, i18n |
| [docs/PROJECT_FORMAT.md](docs/PROJECT_FORMAT.md) | Формат v1, миграции, хранилище, autosave |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Этапы 0–7 и критерии приёмки |
| [docs/IDEAS.md](docs/IDEAS.md) | Идеи (утверждённые и экспериментальные) |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Обоснованные технические решения |

## Безопасность

Репозиторий **публичный**. В Git **никогда** не попадают реальные секреты (Telegram Bot Token, API keys, JWT/encryption secrets, production .env). В репозитории есть только [.env.example](.env.example) с названиями переменных и фиктивными значениями. Токен Telegram-бота в будущем хранится только на backend-сервере NODEZZLE, не во frontend.

## Язык

Основной (и единственный на MVP-этапе) язык интерфейса, блоков и документации — **русский** (ru-RU). Технические идентификаторы (id, поля API, типы TypeScript) — на английском. Архитектура i18n позволяет добавить другие языки без переписывания UI.

## Лицензия и вклад

Проект NODEZZLE развивается в этом репозитории — он является долговременной памятью проекта. Перед внесением изменений прочитайте [AGENTS.md](AGENTS.md).
