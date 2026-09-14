/**
 * NODEZZLE — Реестр блоков.
 *
 * Регистрация деталей расширяема: новый блок/платформа = новая
 * Block Definition, зарегистрированная здесь. Ядро Canvas, runtime
 * и UI читают только реестр — переписывание при добавлении блока
 * не требуется (см. docs/BLOCKS.md).
 */

import type { BlockCategory } from '../types/blocks';
import type { BlockDefinition, BlockStatus } from '../types/blocks';

/**
 * Фактический статус определения (Этап 4): явное поле `status` важнее всего;
 * иначе — «реализовано», если есть исполнение и деталь доступна,
 * «запланировано» — если исполнения нет или деталь скрыта.
 */
export function effectiveStatus(def: BlockDefinition): BlockStatus {
  if (def.status) return def.status;
  if (def.available === false || !def.runtime) return 'planned';
  return 'implemented';
}

export class BlockRegistry {
  private byId = new Map<string, BlockDefinition>();

  register(def: BlockDefinition): this {
    if (this.byId.has(def.id)) {
      throw new Error(`Блок уже зарегистрирован: ${def.id}`);
    }
    // Базовые инварианты дефиниции.
    if (!def.id || !def.id.includes('.')) {
      throw new Error(`Некорректный id блока: ${def.id}`);
    }
    // id порта уникален в пределах направления (INPUT и OUTPUT
    // могут повторять id — напр. pass-through: value → value).
    const seenPorts = new Set<string>();
    for (const port of def.inputs) {
      const key = `in:${port.id}`;
      if (seenPorts.has(key)) throw new Error(`Дублирующийся порт в блоке ${def.id}: ${port.id}`);
      seenPorts.add(key);
    }
    for (const port of def.outputs) {
      const key = `out:${port.id}`;
      if (seenPorts.has(key)) throw new Error(`Дублирующийся порт в блоке ${def.id}: ${port.id}`);
      seenPorts.add(key);
    }
    this.byId.set(def.id, def);
    return this;
  }

  get(id: string): BlockDefinition | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  list(): BlockDefinition[] {
    return [...this.byId.values()];
  }

  /** Блоки, готовые к использованию (available !== false) — показываются в палитре. */
  available(): BlockDefinition[] {
    return this.list().filter((d) => d.available !== false);
  }

  byCategory(category: BlockCategory): BlockDefinition[] {
    return this.list().filter((d) => d.category === category);
  }

  /** Все триггеры (точки входа) реестра. */
  triggers(): BlockDefinition[] {
    return this.list().filter((d) => d.trigger === true);
  }
}

/** Глобальный реестр блоков приложения (заполняется из src/blocks). */
export const blockRegistry = new BlockRegistry();
