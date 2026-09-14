/**
 * Чистые помощники библиотеки деталей (без React — покрываются юнит-тестами).
 *
 * Здесь: полезная нагрузка drag & drop, поиск по определению блока,
 * список недавних деталей.
 */

import type { BlockDefinition } from '@/core/types/blocks';

/** MIME-тип перетаскивания детали из библиотеки на Canvas. */
export const DND_MIME = 'application/nodezzle-block';

/** Полезная нагрузка drag & drop: какой блок вставить и с какими настройками. */
export interface DndPayload {
  blockId: string;
  /** Переопределения конфигурации экземпляра (напр. modelId для «Вызов модели»). */
  config?: Record<string, unknown>;
}

export function encodeDnd(payload: DndPayload): string {
  return JSON.stringify(payload);
}

/**
 * Разбор полезной нагрузки. Понимает новый формат (JSON) и старый
 * (просто идентификатор блока) — для совместимости.
 */
export function decodeDnd(raw: string): DndPayload | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as DndPayload).blockId === 'string' &&
      (parsed as DndPayload).blockId.length > 0
    ) {
      const payload = parsed as DndPayload;
      const config =
        payload.config !== null && typeof payload.config === 'object' && !Array.isArray(payload.config)
          ? (payload.config as Record<string, unknown>)
          : undefined;
      return { blockId: payload.blockId, ...(config ? { config } : {}) };
    }
  } catch {
    // Не JSON — ниже пробуем формат «просто идентификатор».
  }
  if (/^[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(raw)) return { blockId: raw };
  return null;
}

/** Локализованные тексты блока для поиска (название/описание подставляются из i18n). */
export interface BlockSearchTexts {
  label: string;
  description: string;
}

/**
 * Поиск блока: по названию, описанию, техническому идентификатору
 * и ключевым словам. Пустой запрос подходит всем.
 */
export function matchesQuery(def: BlockDefinition, query: string, texts: BlockSearchTexts): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  const haystacks: string[] = [texts.label, texts.description, def.id, ...(def.keywords ?? [])];
  return haystacks.some((value) => typeof value === 'string' && value.toLowerCase().includes(q));
}

/** Недавние детали: новая — в начало, без дублей, с ограничением длины. */
export function pushRecent(list: string[], blockId: string, limit: number): string[] {
  return [blockId, ...list.filter((id) => id !== blockId)].slice(0, limit);
}

/** Узел схемы для поиска (минимальная структура, без типов React Flow). */
export interface SchemaNodeLike {
  data: { blockId: string; label?: string };
}

/**
 * Поиск узла схемы по запросу: имя экземпляра, идентификатор блока,
 * локализованное название блока. Пустой запрос подходит всем.
 */
export function nodeMatchesQuery(
  node: SchemaNodeLike,
  query: string,
  blockLabel: (blockId: string) => string,
): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  const label = node.data?.label;
  if (typeof label === 'string' && label.toLowerCase().includes(q)) return true;
  const blockId = node.data?.blockId ?? '';
  if (blockId.toLowerCase().includes(q)) return true;
  return blockLabel(blockId).toLowerCase().includes(q);
}
