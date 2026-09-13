/**
 * NODEZZLE — УМНЫЕ СОЕДИНЕНИЯ: правила совместимости портов.
 *
 * Правила (MVP):
 *  - ERROR OUTPUT → ERROR INPUT: только error ↔ error;
 *  - EVENT OUTPUT → EVENT INPUT: только event ↔ event;
 *  - DATA → DATA: `any` совместим со всем; иначе — равные типы.
 *
 * Преобразование типов между несовместимыми портами выполняется
 * Converter-блоками (категория «Данные»): Текст→Число, JSON→Текст и т.д.
 *
 * Визуальная часть (подсветка совместимых портов во время перетаскивания,
 * «притягивание», анимация соединения) — в UI-слое Canvas.
 */

import type { PortDefinition } from '../types/ports';
import { typeRegistry } from '../types/ports';

export type CompatibilityCode =
  | 'ok'
  | 'kind-mismatch'
  | 'type-mismatch'
  | 'unknown-port';

export interface CompatibilityResult {
  allowed: boolean;
  code: CompatibilityCode;
}

/** Совместим ли OUTPUT `source` с INPUT `target`. */
export function checkCompatibility(source: PortDefinition, target: PortDefinition): CompatibilityResult {
  if (!source || !target) return { allowed: false, code: 'unknown-port' };

  // Ошибка — только в error-вход.
  if (source.kind === 'error') return target.kind === 'error' ? { allowed: true, code: 'ok' } : { allowed: false, code: 'kind-mismatch' };
  if (target.kind === 'error') return { allowed: false, code: 'kind-mismatch' };

  // События — только event ↔ event.
  if (source.kind === 'event' || target.kind === 'event') {
    return source.kind === 'event' && target.kind === 'event'
      ? { allowed: true, code: 'ok' }
      : { allowed: false, code: 'kind-mismatch' };
  }

  // data ↔ data
  if (source.type === 'any' || target.type === 'any') return { allowed: true, code: 'ok' };

  // Пользовательские типы: совместимость, декларированная в TypeRegistry.
  const custom = typeRegistry.get(source.type);
  if (custom) {
    return custom.compatibleWith.includes(target.type as never) || source.type === target.type
      ? { allowed: true, code: 'ok' }
      : { allowed: false, code: 'type-mismatch' };
  }

  return source.type === target.type ? { allowed: true, code: 'ok' } : { allowed: false, code: 'type-mismatch' };
}

/** Краткий публичный API. */
export function isCompatible(source: PortDefinition, target: PortDefinition): boolean {
  return checkCompatibility(source, target).allowed;
}

/**
 * Цвета типов портов — визуальный язык INPUT/OUTPUT.
 * Используется для маркеров портов, рёбер и minimap.
 */
export const PORT_TYPE_COLORS: Record<string, string> = {
  any: '#94a3b8',
  text: '#22d3ee',
  number: '#a78bfa',
  boolean: '#fbbf24',
  json: '#a3e635',
  object: '#34d399',
  array: '#4ade80',
  file: '#fb923c',
  image: '#f472b6',
  user: '#60a5fa',
  date: '#38bdf8',
  url: '#818cf8',
  secret: '#f87171',
  telegram_message: '#2dd4bf',
  event: '#e879f9',
  error: '#ef4444',
};

export function portColor(type: string): string {
  return PORT_TYPE_COLORS[type] ?? '#64748b';
}
