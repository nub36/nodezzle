/**
 * Категория «Ядро» — константы и примитивы (Этап 4, часть A).
 *
 * Дополнение базовых констант из `core/blocks.ts`. Всё, что не требует
 * внешних систем, исполняется синхронно и покрыто каталожными тестами.
 */

import type { BlockDefinition } from '@/core/types/blocks';
import { dport, eport, ERR } from '../shared';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

export const coreValueBlocks: BlockDefinition[] = [
  {
    id: 'core.boolean',
    labelKey: 'blocks.core.boolean.label',
    descriptionKey: 'blocks.core.boolean.description',
    keywords: ['логическое', 'булево', 'константа', 'истина', 'ложь', 'да', 'нет'],
    category: 'core',
    subcategory: 'Константы',
    inputs: [],
    outputs: [dport('value', 'blocks.ports.value', 'boolean')],
    defaults: { value: true },
    status: 'implemented',
    difficulty: 'basic',
    runtime: ({ config }) => ({ outputs: { value: Boolean(config.value) } }),
    ui: { icon: '✓', color: '#22d3ee' },
  },
  {
    id: 'core.array',
    labelKey: 'blocks.core.array.label',
    descriptionKey: 'blocks.core.array.description',
    keywords: ['массив', 'список', 'константа', 'перечисление'],
    category: 'core',
    subcategory: 'Константы',
    inputs: [],
    outputs: [dport('value', 'blocks.ports.value', 'array'), eport()],
    defaults: { value: '[]' },
    status: 'implemented',
    difficulty: 'advanced',
    runtime: ({ config }) => {
      try {
        const parsed: unknown = JSON.parse(String(config.value ?? '[]'));
        if (!Array.isArray(parsed)) return { error: ERR.INVALID_JSON };
        return { outputs: { value: parsed } };
      } catch {
        return { error: ERR.INVALID_JSON };
      }
    },
    ui: { icon: '[…]', color: '#22d3ee' },
  },
  {
    id: 'core.object',
    labelKey: 'blocks.core.object.label',
    descriptionKey: 'blocks.core.object.description',
    keywords: ['объект', 'словарь', 'константа', 'структура'],
    category: 'core',
    subcategory: 'Константы',
    inputs: [],
    outputs: [dport('value', 'blocks.ports.value', 'object'), eport()],
    defaults: { value: '{}' },
    status: 'implemented',
    difficulty: 'advanced',
    runtime: ({ config }) => {
      try {
        const parsed: unknown = JSON.parse(String(config.value ?? '{}'));
        if (!isPlainObject(parsed)) return { error: ERR.INVALID_OBJECT };
        return { outputs: { value: parsed } };
      } catch {
        return { error: ERR.INVALID_JSON };
      }
    },
    ui: { icon: '{}', color: '#22d3ee' },
  },
  {
    id: 'core.url',
    labelKey: 'blocks.core.url.label',
    descriptionKey: 'blocks.core.url.description',
    keywords: ['ссылка', 'адрес', 'урл', 'константа'],
    category: 'core',
    subcategory: 'Константы',
    inputs: [],
    outputs: [dport('value', 'blocks.ports.url', 'url')],
    defaults: { value: 'https://' },
    status: 'implemented',
    difficulty: 'basic',
    runtime: ({ config }) => ({ outputs: { value: String(config.value ?? '') } }),
    ui: { icon: '🔗', color: '#22d3ee' },
  },
  {
    id: 'core.template',
    labelKey: 'blocks.core.template.label',
    descriptionKey: 'blocks.core.template.description',
    keywords: ['шаблон', 'текст', 'подстановка', 'плейсхолдер'],
    category: 'core',
    subcategory: 'Константы',
    available: false,
    status: 'planned',
    inputs: [dport('values', 'blocks.ports.data', 'object')],
    outputs: [dport('text', 'blocks.ports.text', 'text')],
    defaults: { template: 'Привет, {{имя}}!' },
    difficulty: 'basic',
    ui: { icon: '🧾', color: '#22d3ee' },
  },
];
