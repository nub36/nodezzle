/** Общие помощники для дефиниций блоков. */

import { definePort, type PortDefinition } from '@/core/types/ports';

/** Data-порт. */
export const dport = (id: string, labelKey: string, type: string, extra?: Parameters<typeof definePort>[4]): PortDefinition =>
  definePort(id, labelKey, 'data', type, extra);

/** Error-порт (ERROR OUTPUT / ERROR INPUT). */
export const eport = (id = 'error', labelKey = 'blocks.ports.error'): PortDefinition =>
  definePort(id, labelKey, 'error', 'error');

/** Event-порт (EVENT OUTPUT / EVENT INPUT). */
export const vport = (id: string, labelKey: string): PortDefinition =>
  definePort(id, labelKey, 'event', 'event');

/** Коды ошибок runtime (ключи i18n `errors.*`). */
export const ERR = {
  EMPTY_INPUT: 'ERR_EMPTY_INPUT',
  INVALID_NUMBER: 'ERR_INVALID_NUMBER',
  INVALID_JSON: 'ERR_INVALID_JSON',
  INVALID_BOOLEAN: 'ERR_INVALID_BOOLEAN',
  INVALID_OBJECT: 'ERR_INVALID_OBJECT',
  MODEL_NOT_FOUND: 'ERR_MODEL_NOT_FOUND',
  MODEL_EXECUTION: 'ERR_MODEL_EXECUTION',
  RUNTIME: 'ERR_RUNTIME',
  CANCELLED: 'ERR_CANCELLED',
  OUT_OF_RANGE: 'ERR_OUT_OF_RANGE',
  KEY_NOT_FOUND: 'ERR_KEY_NOT_FOUND',
  INVALID_DATE: 'ERR_INVALID_DATE',
} as const;
