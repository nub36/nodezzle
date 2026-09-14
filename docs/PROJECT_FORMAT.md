# NODEZZLE — Формат проекта и хранение

## Принципы

- **Zod = источник правды.** Схема `nodezzleProjectSchema` (`src/core/project/schema.ts`) описывает формат; TS-типы выводятся из неё (`z.infer`). Разношорирование схемы и типов невозможно.
- **`formatVersion`** — версия формата (сейчас `1`). Загружаемые проекты с другой версией проходят мигратор (задел), неизвестные версии отклоняются.
- **Unknown-поля:** ядро не ломается от полей, которых не знает (forward compatibility); явные нарушения схемы отклоняются при загрузке.
- **Хранение абстрагировано** (`ProjectStorage`): MVP — LocalStorage, будущее — API backend. UI не знает, где лежат данные.

## Структура (formatVersion 1)

```jsonc
{
  "formatVersion": 1,
  "id": "uuid",
  "name": "Мой Telegram-бот",
  "kind": "telegram",               // telegram | web | telegram-web | empty
  "canvas": {
    "id": "uuid",
    "name": "Схема",
    "nodes": [
      {
        "id": "uuid",
        "blockId": "telegram.message_received",  // ссылка на Block Definition
        "label": "переименовано пользователем",  // опционально
        "position": { "x": 0, "y": 0 },
        "config": { "": "значения параметров экземпляра" }
      }
    ],
    "edges": [
      { "id": "uuid", "source": "nodeId", "sourcePort": "portId", "target": "nodeId", "targetPort": "portId" }
    ],
    "viewport": { "x": 0, "y": 0, "zoom": 1 },  // опционально
    "groups": [                                  // опционально (Этап 2, F ч. 2)
      { "id": "uuid", "label": "Оплата", "nodeIds": ["uuid1", "uuid2"] }
    ]
  },
  "models": [
    {
      "id": "uuid",
      "name": "Order Model",
      "version": 1,
      "contract": {
        "inputs":  [{ "id": "user_id", "name": "Пользователь", "type": "number", "required": true }],
        "outputs": [{ "id": "order_id", "name": "Заказ", "type": "number" }],
        "error":   { "id": "error_message", "name": "Ошибка", "type": "text" }
      },
      "canvas": { "...": "CanvasDocument (та же структура, что у проекта)" },
      "updatedAt": 0
    }
  ],
  "variables": [
    { "id": "uuid", "name": "greeting", "type": "text", "value": "Привет", "scope": "project" }
  ],
  "meta": { "createdAt": 0, "updatedAt": 0 }
}
```

**CanvasDocument** (общий для схемы проекта и схем моделей): `id, name, nodes[], edges[], viewport?, groups?`. Узлы и соединения валидируются (min length, наличие blockId/portId). `groups` — опциональные визуальные рамки: `{ id, label?, nodeIds[] }` (Этап 2, подэтап F часть 2); старые проекты без поля остаются валидными.

## Сериализация React Flow ↔ формат

`src/core/project/serialize.ts`:
- `canvasToFlow` / `flowToCanvas` — обратимое преобразование;
- формат хранилища **не содержит** UI-состояния React Flow (selected, measured…) — только канонические данные.

## Хранилище (ProjectStorage)

```ts
interface ProjectStorage {
  list(): Promise<ProjectSummary[]>;
  get(id): Promise<NodezzleProject | null>;
  save(project): Promise<void>;
  remove(id): Promise<void>;
}
```

**LocalStorageAdapter** (MVP): ключи `nodezzle.project.<id>`, JSON, валидация при чтении (повреждённые данные → `null`, список не ломается).

## Autosave

- Каждое изменение схемы (добавление/удаление/двиг/соединение/конфиг/имя) → **debounce 900 мс** → `ProjectStorage.save`.
- Статус в Toolbar: «Черновик» → «Сохранение…» → «Сохранено <время>».
- **Flush**: при `beforeunload` (закрытие вкладки) и при переходе между проектами — синхронное сохранение.
- History/версии (см. ниже) расширяют этот механизм без изменения UI.

## Undo/Redo

Явная история снапшотов canvas (до 100 состояний) в `project-store`: undo/redo (`Ctrl+Z` / `Ctrl+Shift+Z`), дубликаты/копирование/вставка, удаление. Снапшоты — канонические данные (nodes/edges/groups), не UI-состояние.

## Версии и миграции (задел)

- `formatVersion` в корне проекта; `version` у моделей.
- Мигратор: цепочка `v1 → v2 → …` (реализуется при первом изменении формата — этапы 3–4).
- История версий (сравнение, откат) — этап 7 ROADMAP: снапшоты проекта с метаданными (кто/когда/что).

## Правила

- Не добавлять в формат «служебные» UI-поля.
- Новые поля — опциональные (старые проекты остаются валидными).
- Удаление/переименование полей — только через migration + bump `formatVersion` + обновление этого документа.
- Секреты (токены, ключи) **не хранятся** в формате проекта (только ссылки на серверные секреты, в будущем).
