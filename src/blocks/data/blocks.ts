/**
 * Категория «Данные» (data): Converter-блоки — преобразование типов.
 * Несовместимые порты соединяются только через конвертеры
 * (см. docs/BLOCKS.md, раздел «Конвертеры»).
 */

import type { BlockDefinition } from '@/core/types/blocks';
import { dport, eport, ERR } from '../shared';

const TRUTHY = new Set(['true', '1', 'да', 'yes', 'y']);
const FALSY = new Set(['false', '0', 'нет', 'no', 'n']);

export const dataBlocks: BlockDefinition[] = [
  {
    id: 'data.text_to_number',
    labelKey: 'blocks.data.text_to_number.label',
    descriptionKey: 'blocks.data.text_to_number.description',
    keywords: ['конвертер', 'преобразование', 'текст в число', 'число'],
    category: 'converters',
    difficulty: 'basic',
    inputs: [dport('value', 'blocks.ports.text', 'text')],
    outputs: [dport('value', 'blocks.ports.value', 'number'), eport()],
    runtime: ({ inputs }) => {
      const raw = inputs.value;
      if (raw === undefined || raw === null || String(raw).trim() === '') return { error: ERR.EMPTY_INPUT };
      const n = Number(String(raw).trim().replace(',', '.'));
      if (Number.isNaN(n)) return { error: ERR.INVALID_NUMBER };
      return { outputs: { value: n } };
    },
    ui: { icon: '🔤→1', color: '#a3e635' },
  },
  {
    id: 'data.number_to_text',
    labelKey: 'blocks.data.number_to_text.label',
    descriptionKey: 'blocks.data.number_to_text.description',
    keywords: ['конвертер', 'преобразование', 'число в текст', 'текст'],
    category: 'converters',
    difficulty: 'basic',
    inputs: [dport('value', 'blocks.ports.value', 'number')],
    outputs: [dport('value', 'blocks.ports.value', 'text'), eport()],
    runtime: ({ inputs }) => {
      if (inputs.value === undefined || inputs.value === null) return { error: ERR.EMPTY_INPUT };
      return { outputs: { value: String(inputs.value) } };
    },
    ui: { icon: '1→🔤', color: '#a3e635' },
  },
  {
    id: 'data.text_to_boolean',
    labelKey: 'blocks.data.text_to_boolean.label',
    descriptionKey: 'blocks.data.text_to_boolean.description',
    keywords: ['конвертер', 'логическое', 'истина', 'ложь', 'да', 'нет'],
    category: 'converters',
    difficulty: 'basic',
    inputs: [dport('value', 'blocks.ports.text', 'text')],
    outputs: [dport('value', 'blocks.ports.value', 'boolean'), eport()],
    runtime: ({ inputs }) => {
      const raw = String(inputs.value ?? '').trim().toLowerCase();
      if (TRUTHY.has(raw)) return { outputs: { value: true } };
      if (FALSY.has(raw)) return { outputs: { value: false } };
      return { error: ERR.INVALID_BOOLEAN };
    },
    ui: { icon: '✓/✗', color: '#a3e635' },
  },
  {
    id: 'data.text_to_json',
    labelKey: 'blocks.data.text_to_json.label',
    descriptionKey: 'blocks.data.text_to_json.description',
    keywords: ['конвертер', 'джсон', 'разбор', 'парс'],
    category: 'converters',
    difficulty: 'basic',
    inputs: [dport('value', 'blocks.ports.text', 'text')],
    outputs: [dport('value', 'blocks.ports.value', 'json'), eport()],
    runtime: ({ inputs }) => {
      const raw = String(inputs.value ?? '');
      try {
        return { outputs: { value: JSON.parse(raw) } };
      } catch {
        return { error: ERR.INVALID_JSON };
      }
    },
    ui: { icon: '🧾←🔤', color: '#a3e635' },
  },
  {
    id: 'data.json_to_text',
    labelKey: 'blocks.data.json_to_text.label',
    descriptionKey: 'blocks.data.json_to_text.description',
    keywords: ['конвертер', 'джсон', 'сериализация', 'текст'],
    category: 'converters',
    difficulty: 'basic',
    inputs: [dport('value', 'blocks.ports.value', 'json')],
    outputs: [dport('value', 'blocks.ports.value', 'text'), eport()],
    runtime: ({ inputs }) => {
      try {
        return { outputs: { value: JSON.stringify(inputs.value ?? null) } };
      } catch {
        return { error: ERR.INVALID_JSON };
      }
    },
    ui: { icon: '🔤←🧾', color: '#a3e635' },
  },
  {
    id: 'data.to_object',
    labelKey: 'blocks.data.to_object.label',
    descriptionKey: 'blocks.data.to_object.description',
    keywords: ['объект', 'обернуть', 'ключ', 'словарь'],
    difficulty: 'advanced',
    category: 'converters',
    inputs: [dport('value', 'blocks.ports.value', 'any')],
    outputs: [dport('payload', 'blocks.ports.payload', 'object')],
    defaults: { key: 'value' },
    runtime: ({ inputs, config }) => {
      const key = String(config.key ?? 'value');
      return { outputs: { payload: { [key]: inputs.value ?? null } } };
    },
    ui: { icon: '📦', color: '#a3e635' },
  },
  {
    id: 'data.from_object',
    labelKey: 'blocks.data.from_object.label',
    descriptionKey: 'blocks.data.from_object.description',
    keywords: ['объект', 'извлечь', 'поле', 'ключ', 'словарь'],
    difficulty: 'advanced',
    category: 'converters',
    inputs: [dport('payload', 'blocks.ports.payload', 'object')],
    outputs: [dport('value', 'blocks.ports.value', 'any'), eport()],
    defaults: { key: 'value' },
    runtime: ({ inputs, config }) => {
      const obj = inputs.payload;
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return { error: ERR.INVALID_OBJECT };
      const key = String(config.key ?? 'value');
      return { outputs: { value: (obj as Record<string, unknown>)[key] ?? null } };
    },
    ui: { icon: '📦→', color: '#a3e635' },
  },
];
