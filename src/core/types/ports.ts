/**
 * NODEZZLE — типы портов (INPUT/OUTPUT).
 *
 * Каждая деталь (блок) может иметь произвольное количество INPUT/OUTPUT:
 * data-порты (значения), event-порты (сигналы событий) и error-порты.
 *
 * Базовый набор типов расширим: пользовательские типы регистрируются
 * в TypeRegistry (см. docs/ARCHITECTURE.md, раздел «Система типов»).
 */

/** Базовые типы портов NODEZZLE. */
export const BASE_PORT_TYPES = [
  'any',
  'text',
  'number',
  'boolean',
  'json',
  'object',
  'array',
  'file',
  'image',
  'user',
  'date',
  'url',
  'secret',
  'telegram_message',
  'event',
  'error',
] as const;

export type BasePortType = (typeof BASE_PORT_TYPES)[number];

/**
 * Тип порта. Базовые типы + произвольные пользовательские строковые
 * идентификаторы (регистрируемые через TypeRegistry).
 */
export type PortType = BasePortType | (string & {});

/**
 * Разновидность порта:
 * - `data`  — переносит значение (Text, Number, JSON, ...);
 * - `event` — переносит сигнал события (SEND EVENT / RECEIVE EVENT);
 * - `error` — переносит сигнал ошибки (ERROR OUTPUT / ERROR INPUT).
 */
export type PortKind = 'data' | 'event' | 'error';

/** Направление порта в пределах детали. */
export type PortDirection = 'input' | 'output';

/** Описание порта в дефиниции блока. */
export interface PortDefinition {
  /** Технический идентификатор порта (устойчив внутри схемы, на английском). */
  id: string;
  /** i18n-ключ отображаемого названия (для пользователя — на русском). */
  labelKey: string;
  kind: PortKind;
  /**
   * Для data-портов — тип значения.
   * Для event-портов — 'event', для error-портов — 'error'.
   */
  type: PortType;
  /** Обязательный вход (runtime будет ждать значение). */
  required?: boolean;
  /** i18n-ключ описания (подсказка). */
  descriptionKey?: string;
}

/** Фабрика PortDefinition — краткая запись для дефиниций блоков. */
export function definePort(
  id: string,
  labelKey: string,
  kind: PortKind,
  type: PortType,
  extra: Partial<Pick<PortDefinition, 'required' | 'descriptionKey'>> = {},
): PortDefinition {
  return { id, labelKey, kind, type, ...extra };
}

/**
 * Пользовательский (расширенный) тип порта.
 * Ядро знает только про совместимость базовых типов;
 * кастомные типы могут декларировать совместимость с базовыми.
 */
export interface CustomPortType {
  id: string;
  labelKey: string;
  descriptionKey?: string;
  /** С базовыми типами, в которые кастомный тип можно «лить» без конвертера. */
  compatibleWith: BasePortType[];
}

/** Реестр пользовательских типов портов (расширяемость INPUT/OUTPUT). */
export class TypeRegistry {
  private custom = new Map<string, CustomPortType>();

  register(type: CustomPortType): this {
    if (this.custom.has(type.id)) {
      throw new Error(`Тип порта уже зарегистрирован: ${type.id}`);
    }
    this.custom.set(type.id, type);
    return this;
  }

  get(id: string): CustomPortType | undefined {
    return this.custom.get(id);
  }

  isKnown(id: string): boolean {
    return (BASE_PORT_TYPES as readonly string[]).includes(id) || this.custom.has(id);
  }

  list(): CustomPortType[] {
    return [...this.custom.values()];
  }
}

/** Глобальный реестр типов портов приложения. */
export const typeRegistry = new TypeRegistry();
