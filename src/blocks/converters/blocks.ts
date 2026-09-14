/**
 * Категория «Конвертеры» — дополнения Этапа 4 (часть G).
 *
 * Семь конвертеров, унаследованных от категории «Данные», сохраняют
 * идентификаторы `data.*` (стабильность формата проектов) и живут
 * в `src/blocks/data/blocks.ts`. Здесь — новые преобразования
 * с идентификаторами `converters.*`.
 */

import type { BlockDefinition } from '@/core/types/blocks';
import { dport, eport, ERR } from '../shared';

const converterColor = '#2dd4bf';

function toBooleanValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['true', 'да', '1', 'истина', 'вкл'].includes(v)) return true;
    if (['false', 'нет', '0', 'ложь', 'выкл', ''].includes(v)) return false;
    return null;
  }
  return null;
}

export const converterBlocks: BlockDefinition[] = [
  {
    id: 'converters.text_to_array',
    version: '1',
    labelKey: 'blocks.converters.text_to_array.label',
    descriptionKey: 'blocks.converters.text_to_array.description',
    keywords: ['конвертер', 'текст', 'массив', 'разбить', 'список'],
    category: 'converters',
    subcategory: 'текст и массивы',
    difficulty: 'basic',
    status: 'implemented',
    inputs: [dport('text', 'blocks.ports.text', 'text')],
    outputs: [dport('array', 'blocks.ports.array', 'array')],
    defaults: { separator: ',' },
    runtime: ({ inputs, config }) => {
      const text = String(inputs.text ?? '');
      const separator = String(config.separator ?? ',');
      const array = separator === '' ? text.split('') : text.split(separator);
      return { outputs: { array: array.map((item) => item.trim()) } };
    },
    ui: { icon: '🔁', color: converterColor },
  },
  {
    id: 'converters.array_to_text',
    version: '1',
    labelKey: 'blocks.converters.array_to_text.label',
    descriptionKey: 'blocks.converters.array_to_text.description',
    keywords: ['конвертер', 'массив', 'текст', 'склеить', 'строка'],
    category: 'converters',
    subcategory: 'текст и массивы',
    difficulty: 'basic',
    status: 'implemented',
    inputs: [dport('array', 'blocks.ports.array', 'array')],
    outputs: [dport('text', 'blocks.ports.text', 'text'), eport()],
    defaults: { separator: ', ' },
    runtime: ({ inputs, config }) => {
      if (!Array.isArray(inputs.array)) return { error: ERR.INVALID_JSON };
      const separator = String(config.separator ?? ', ');
      return { outputs: { text: (inputs.array as unknown[]).map((v) => String(v ?? '')).join(separator) } };
    },
    ui: { icon: '🔁', color: converterColor },
  },
  {
    id: 'converters.boolean_to_text',
    version: '1',
    labelKey: 'blocks.converters.boolean_to_text.label',
    descriptionKey: 'blocks.converters.boolean_to_text.description',
    keywords: ['конвертер', 'логическое', 'текст', 'да', 'нет'],
    category: 'converters',
    subcategory: 'логика и текст',
    difficulty: 'basic',
    status: 'implemented',
    inputs: [dport('boolean', 'blocks.ports.boolean', 'boolean')],
    outputs: [dport('text', 'blocks.ports.text', 'text'), eport()],
    defaults: { trueText: 'Да', falseText: 'Нет' },
    runtime: ({ inputs, config }) => {
      const value = toBooleanValue(inputs.boolean);
      if (value === null) return { error: ERR.INVALID_BOOLEAN };
      return { outputs: { text: value ? String(config.trueText ?? 'Да') : String(config.falseText ?? 'Нет') } };
    },
    ui: { icon: '🔁', color: converterColor },
  },
];
