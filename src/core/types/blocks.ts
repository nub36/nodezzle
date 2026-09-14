/**
 * NODEZZLE — Block Definition (Node Definition).
 *
 * Единый формат описания любой детали: ядро Canvas НЕ привязано
 * к конкретным Telegram/Web-блокам — новые платформы подключаются
 * регистрацией дефиниций (см. docs/BLOCKS.md).
 *
 * Пример:
 *   {
 *     id: 'telegram.message_received',
 *     labelKey: 'blocks.telegram.message_received.label',
 *     category: 'telegram',
 *     trigger: true,
 *     inputs: [],
 *     outputs: [ ... ],
 *     runtime: (ctx) => ({ ... }),
 *   }
 */

import type { PortDefinition } from './ports';
import type { NodeHandler, TriggerPayload } from './runtime';

/** Базовые категории библиотеки деталей (названия для UI — в i18n `categories.*`). */
export const BLOCK_CATEGORIES = [
  'core',
  'logic',
  'data',
  'flow',
  // Этап 4: категории «Телеграм» и «Веб» разделены на события/действия и
  // интерфейс/события. Старые 'telegram'/'web' удалены из перечня —
  // все определения перенесены в новые категории (категория в формате
  // проекта не хранится, поэтому миграция не требуется).
  'telegram_events',
  'telegram_actions',
  'web_ui',
  'web_events',
  'models',
  'memory',
  'http',
  'datetime',
  'media',
  'security',
  'debug',
  'converters',
  'ai',
  'notes',
] as const;

export type BlockCategory = (typeof BLOCK_CATEGORIES)[number];

/** UI-метаданные блока (иконка, акцентный цвет). */
export interface BlockUiMeta {
  /** Символ/эмодзи для палитры. */
  icon?: string;
  color?: string;
}

/**
 * Сложность детали для пользователя (поле из Этапа 4 — «Библиотека блоков»):
 * «Базовые» попадают в режим «Основные» библиотеки, «Продвинутые» — только в «Все».
 */
export type BlockDifficulty = 'basic' | 'advanced';

/**
 * Зрелость определения (Этап 4 — «Библиотека блоков»,
 * см. docs/agent-plan/04-BLOCK-LIBRARY.md и docs/BLOCK_CATALOG.md):
 * - planned — только определение/контракт, исполнение не реализовано;
 * - prototype — черновое исполнение, поведение может меняться;
 * - implemented — стабильное исполнение;
 * - experimental — доступно, но поведение может существенно меняться;
 * - deprecated — не рекомендуется, поддерживается совместимость.
 * Если поле не задано, статус выводится функцией `effectiveStatus`.
 */
export type BlockStatus = 'planned' | 'prototype' | 'implemented' | 'experimental' | 'deprecated';

export interface BlockDefinition {
  /** Уникальный технический идентификатор: `<category>.<name>`. */
  id: string;
  /** i18n-ключ названия (показывается пользователю). */
  labelKey: string;
  /** i18n-ключ описания. */
  descriptionKey?: string;
  category: BlockCategory;
  /**
   * Точка входа выполнения схемы (триггер):
   * «Получено сообщение», «Команда», «Загрузка страницы» и т.д.
   */
  trigger?: boolean;
  /**
   * Точка входа ВНУТРИ модели («Вход модели»).
   * Является entry-точкой, но не триггером платформы.
   */
  entry?: boolean;
  /**
   * false — деталь зарезервирована архитектурно,
   * но runtime ещё не реализован (скрыта из палитры).
   */
  available?: boolean;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  /** Значения конфигурации по умолчанию (копируются в экземпляр). */
  defaults?: Record<string, unknown>;
  /**
   * Проверка применимости triггера к payload.
   * Напр. блок «Команда» срабатывает только на свою команду.
   */
  matches?: (payload: TriggerPayload, config: Record<string, unknown>) => boolean;
  /** Обработчик выполнения (runtime handler). */
  runtime?: NodeHandler;
  ui?: BlockUiMeta;
  /**
   * Ключевые слова для поиска в библиотеке (рус/англ, пользователю не показываются).
   * Поле из Этапа 4 — «Библиотека блоков» (см. docs/agent-plan/04-BLOCK-LIBRARY.md).
   */
  keywords?: string[];
  /** Сложность детали: 'basic' — режим «Основные», 'advanced' — только «Все». */
  difficulty?: BlockDifficulty;
  /** Версия определения (задел под совместимость/миграции определений). */
  version?: string;
  /** Уточняющая группировка внутри категории (подкатегория каталога). */
  subcategory?: string;
  /** Зрелость определения; при отсутствии выводится `effectiveStatus`. */
  status?: BlockStatus;
}
