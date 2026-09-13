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
  'telegram',
  'web',
  'models',
  'memory',
  'http',
  'datetime',
  'media',
  'security',
  'debug',
  'ai',
] as const;

export type BlockCategory = (typeof BLOCK_CATEGORIES)[number];

/** UI-метаданные блока (иконка, акцентный цвет). */
export interface BlockUiMeta {
  /** Символ/эмодзи для палитры. */
  icon?: string;
  color?: string;
}

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
}
