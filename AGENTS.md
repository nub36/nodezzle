# AGENTS.md — правила работы с NODEZZLE для AI-агентов

**Читайте этот файл ПЕРВЫМ.** Он обязателен для всех AI-агентов (и людей), работающих в этом репозитории.

## 0. ОБЯЗАТЕЛЬНОЕ ПРАВИЛО — ПЕРЕД ЛЮБОЙ РАЗРАБОТКОЙ NODEZZLE

**ПЕРЕД ЛЮБОЙ РАЗРАБОТКОЙ** прочитать (именно в этом порядке):

1. [docs/agent-plan/00-README.md](docs/agent-plan/00-README.md) — постоянный поэтапный план разработки;
2. [docs/agent-plan/STATUS.md](docs/agent-plan/STATUS.md) — точное место, где остановилась разработка;
3. [docs/agent-plan/RULES.md](docs/agent-plan/RULES.md) — обязательные правила;
4. **Затем — документ текущего этапа** (какой этап текущий — указано в [docs/agent-plan/STATUS.md](docs/agent-plan/STATUS.md); план этапа — в соответствующем файле `docs/agent-plan/`).

Только после этого — выполнять обязательный порядок разделов 3–4 ниже и начинать работу.
Не начинать выполненный этап заново; фактическое состояние всегда сверять по Git.

## 1. Что такое NODEZZLE

NODEZZLE (NODE + PUZZLE) — визуальная среда сборки Telegram-ботов, веб-интерфейсов и систем из соединяемых деталей. Философия: **«Не программируй. Собери.»** Полная концепция — [docs/CONCEPT.md](docs/CONCEPT.md).

Текущий статус: см. **[docs/agent-plan/STATUS.md](docs/agent-plan/STATUS.md)**. Этапы 1–5 и планы 07/08/09 завершены в описанном объёме; результат Telegram/Web — [09-TELEGRAM-WEB.md](docs/agent-plan/09-TELEGRAM-WEB.md). Приоритетный UX-проход [11-NOVICE-CANVAS.md](docs/agent-plan/11-NOVICE-CANVAS.md) выполнен в описанном объёме (0.5.49); далее — выбор основного направления с владельцем. Предыдущий [10-SERVER-PROJECTS.md](docs/agent-plan/10-SERVER-PROJECTS.md): план 10 (A/B1/B2/C) завершён в описанном объёме; следующий выбор ниши — [PRODUCT_FOCUS.md](docs/PRODUCT_FOCUS.md). Дорожная карта — [docs/ROADMAP.md](docs/ROADMAP.md).

## 2. Репозиторий — долговременная память проекта

Единственный основной репозиторий: **https://github.com/nub36/nodezzle**

- НЕ создавать новые репозитории, параллельные ветки разработки или отдельные проекты.
- GitHub отражает актуальное состояние NODEZZLE. Всё важное знание — в коде и документации, а не в чатах.
- После каждого смыслового изменения — commit + push.

## 3. До изменений (обязательный порядок)

1. Прочитать этот файл (AGENTS.md).
2. Изучить документацию затрагиваемой области:
   - блоки → [docs/BLOCKS.md](docs/BLOCKS.md);
   - модели → [docs/MODELS.md](docs/MODELS.md);
   - Telegram → [docs/TELEGRAM.md](docs/TELEGRAM.md);
   - Web → [docs/WEB.md](docs/WEB.md);
   - UI → [docs/UI.md](docs/UI.md);
   - формат/хранилище → [docs/PROJECT_FORMAT.md](docs/PROJECT_FORMAT.md);
   - решения → [docs/DECISIONS.md](docs/DECISIONS.md).
3. Изучить существующую реализацию в `src/` (ядро в `src/core`, блоки в `src/blocks`, экраны в `src/features`).
4. Проверить связанные компоненты (store, i18n-ключи, тесты).
5. Только после этого — менять систему.

## 4. После изменений (обязательный порядок)

1. Проверить код: `npm run typecheck`.
2. Запустить тесты: `npm test`. Новые логику ядра — покрывать unit-тестами (Vitest, файлы `*.test.ts` рядом с кодом).
3. Проверить сборку: `npm run build`.
4. Обновить документацию, которую затронул (таблица из раздела 5).
5. Обновить [CHANGELOG.md](CHANGELOG.md), если изменение существенное.
6. Сделать осмысленный commit (описание — на русском).
7. Push в основной репозиторий.

## 5. Правило сохранения идей (синхронизация документации)

Идеи владельца проекта нельзя терять.

| Что произошло | Куда записать |
|---|---|
| Идея утверждена | Соответствующая документация (см. ниже) |
| Идея экспериментальная | [docs/IDEAS.md](docs/IDEAS.md) |
| Принято архитектурное решение | [docs/DECISIONS.md](docs/DECISIONS.md) (новый ADR) |
| Изменилась концепция | [docs/CONCEPT.md](docs/CONCEPT.md) |
| Изменилась архитектура | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Добавлены/изменены блоки | [docs/BLOCKS.md](docs/BLOCKS.md) |
| Изменился Telegram | [docs/TELEGRAM.md](docs/TELEGRAM.md) |
| Изменился Web | [docs/WEB.md](docs/WEB.md) |
| Изменился формат/хранилище | [docs/PROJECT_FORMAT.md](docs/PROJECT_FORMAT.md) |
| Изменились модели | [docs/MODELS.md](docs/MODELS.md) |
| Изменился UI/визуальный стиль | [docs/UI.md](docs/UI.md) |
| Изменились этапы | [docs/ROADMAP.md](docs/ROADMAP.md) |

## 6. Основные принципы

- **Язык**: пользовательский UI, названия блоков, документация — на русском (ru-RU). Технические идентификаторы (id, ключи API, типы TS) — на английском. Новые пользовательские строки — только через i18n-ключи (`src/i18n/locales/ru.json`), не хардкодом.
- **Расширяемость без переписывания**: новые блоки/платформы — через Block Definition + BlockRegistry. Ядро Canvas и runtime не привязаны к конкретным Telegram/Web-блокам.
- **Минимальные изменения**: не переписывать работающий функционал без необходимости; не добавлять зависимости без причины; не усложнять архитектуру без необходимости.
- **Но и не кривить фундамент**: INPUT/OUTPUT, вложенные модели, Telegram+Web, большой Canvas, версии — проектируются с заделом (см. ROADMAP).
- **Безопасность**: репозиторий публичный. НИКОГДА не коммитить реальные секреты (Telegram Bot Token, API keys, пароли, JWT/encryption secrets, production .env). Перед commit проверять отсутствие секретов. Разрешён только `.env.example` с фиктивными значениями.
- **Качество**: `typecheck` + `test` + `build` должны проходить после каждого изменения.

## 7. Быстрая карта кода

| Где | Что |
|---|---|
| `src/core/types/` | PortDefinition, BlockDefinition, runtime-типы (контракты ядра) |
| `src/core/type-system/compatibility.ts` | правила совместимости портов (умные соединения) |
| `src/core/registry/block-registry.ts` | реестр блоков |
| `src/core/project/schema.ts` | Zod-схема формата проекта (единственный источник правды) |
| `src/core/project/storage.ts` | ProjectStorage (сейчас LocalStorage) |
| `src/core/runtime/execute.ts` | движок выполнения (чистый TS, тестируется) |
| `src/blocks/` | дефиниции блоков: core, data, logic, flow, telegram, web, models, debug, datetime, reserved |
| `src/demo/seed.ts` | демонстрационный проект |
| `src/store/project-store.ts` | undo/redo, autosave, drag&drop, copy/paste |
| `src/store/execution-store.ts` | UI-состояние выполнения |
| `src/features/` | landing, dashboard, canvas (экраны) |
| `src/i18n/locales/ru.json` | все пользовательские строки |

## 8. Локальная разработка

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest (34+ тестов ядра)
npm run typecheck
npm run build
```
