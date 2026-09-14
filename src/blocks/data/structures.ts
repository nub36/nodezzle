/**
 * Категория «Данные» — операции над объектами и массивами (Этап 4, часть A).
 *
 * Исторические конвертеры типов (текст→число и т. п.) перенесены в
 * категорию «Преобразователи» (`converters`), этот файл — структуры.
 */

import type { BlockDefinition } from '@/core/types/blocks';
import { dport, eport, ERR } from '../shared';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

export const dataStructureBlocks: BlockDefinition[] = [
  {
    id: 'data.object_get',
    labelKey: 'blocks.data.object_get.label',
    descriptionKey: 'blocks.data.object_get.description',
    keywords: ['объект', 'ключ', 'получить', 'чтение', 'поле'],
    category: 'data',
    subcategory: 'Объекты',
    inputs: [dport('object', 'blocks.ports.object', 'object')],
    outputs: [dport('value', 'blocks.ports.value', 'any'), eport()],
    defaults: { key: '' },
    status: 'implemented',
    difficulty: 'basic',
    runtime: ({ inputs, config }) => {
      if (!isPlainObject(inputs.object)) return { error: ERR.INVALID_OBJECT };
      const key = String(config.key ?? '');
      if (!(key in inputs.object)) return { error: ERR.KEY_NOT_FOUND };
      return { outputs: { value: inputs.object[key] } };
    },
    ui: { icon: '{}→', color: '#a3e635' },
  },
  {
    id: 'data.object_set',
    labelKey: 'blocks.data.object_set.label',
    descriptionKey: 'blocks.data.object_set.description',
    keywords: ['объект', 'ключ', 'записать', 'изменить', 'поле'],
    category: 'data',
    subcategory: 'Объекты',
    inputs: [
      dport('object', 'blocks.ports.object', 'object'),
      dport('value', 'blocks.ports.value', 'any'),
    ],
    outputs: [dport('object', 'blocks.ports.object', 'object'), eport()],
    defaults: { key: '' },
    status: 'implemented',
    difficulty: 'basic',
    runtime: ({ inputs, config }) => {
      if (!isPlainObject(inputs.object)) return { error: ERR.INVALID_OBJECT };
      return { outputs: { object: { ...inputs.object, [String(config.key ?? '')]: inputs.value } } };
    },
    ui: { icon: '{}←', color: '#a3e635' },
  },
  {
    id: 'data.object_keys',
    labelKey: 'blocks.data.object_keys.label',
    descriptionKey: 'blocks.data.object_keys.description',
    keywords: ['объект', 'ключи', 'список ключей'],
    category: 'data',
    subcategory: 'Объекты',
    inputs: [dport('object', 'blocks.ports.object', 'object')],
    outputs: [dport('keys', 'blocks.ports.keys', 'array'), eport()],
    status: 'implemented',
    difficulty: 'advanced',
    runtime: ({ inputs }) => {
      if (!isPlainObject(inputs.object)) return { error: ERR.INVALID_OBJECT };
      return { outputs: { keys: Object.keys(inputs.object) } };
    },
    ui: { icon: '🔑', color: '#a3e635' },
  },
  {
    id: 'data.object_merge',
    labelKey: 'blocks.data.object_merge.label',
    descriptionKey: 'blocks.data.object_merge.description',
    keywords: ['объект', 'объединить', 'слить', 'смешать'],
    category: 'data',
    subcategory: 'Объекты',
    inputs: [
      dport('a', 'blocks.ports.a', 'object'),
      dport('b', 'blocks.ports.b', 'object'),
    ],
    outputs: [dport('object', 'blocks.ports.object', 'object'), eport()],
    status: 'implemented',
    difficulty: 'advanced',
    runtime: ({ inputs }) => {
      if (!isPlainObject(inputs.a) || !isPlainObject(inputs.b)) return { error: ERR.INVALID_OBJECT };
      return { outputs: { object: { ...inputs.a, ...inputs.b } } };
    },
    ui: { icon: '{}+{}', color: '#a3e635' },
  },
  {
    id: 'data.array_get',
    labelKey: 'blocks.data.array_get.label',
    descriptionKey: 'blocks.data.array_get.description',
    keywords: ['массив', 'индекс', 'элемент', 'получить'],
    category: 'data',
    subcategory: 'Массивы',
    inputs: [dport('array', 'blocks.ports.array', 'array')],
    outputs: [dport('item', 'blocks.ports.item', 'any'), eport()],
    defaults: { index: 0 },
    status: 'implemented',
    difficulty: 'basic',
    runtime: ({ inputs, config }) => {
      if (!Array.isArray(inputs.array)) return { error: ERR.INVALID_JSON };
      const index = Number(config.index ?? 0);
      if (!Number.isInteger(index) || index < 0 || index >= inputs.array.length) {
        return { error: ERR.OUT_OF_RANGE };
      }
      return { outputs: { item: inputs.array[index] } };
    },
    ui: { icon: '[i]', color: '#a3e635' },
  },
  {
    id: 'data.array_add',
    labelKey: 'blocks.data.array_add.label',
    descriptionKey: 'blocks.data.array_add.description',
    keywords: ['массив', 'добавить', 'элемент', 'в конец'],
    category: 'data',
    subcategory: 'Массивы',
    inputs: [
      dport('array', 'blocks.ports.array', 'array'),
      dport('item', 'blocks.ports.item', 'any'),
    ],
    outputs: [dport('array', 'blocks.ports.array', 'array'), eport()],
    status: 'implemented',
    difficulty: 'basic',
    runtime: ({ inputs }) => {
      if (!Array.isArray(inputs.array)) return { error: ERR.INVALID_JSON };
      return { outputs: { array: [...inputs.array, inputs.item] } };
    },
    ui: { icon: '[+]', color: '#a3e635' },
  },
  {
    id: 'data.array_length',
    labelKey: 'blocks.data.array_length.label',
    descriptionKey: 'blocks.data.array_length.description',
    keywords: ['массив', 'длина', 'количество', 'размер'],
    category: 'data',
    subcategory: 'Массивы',
    inputs: [dport('array', 'blocks.ports.array', 'array')],
    outputs: [dport('value', 'blocks.ports.value', 'number'), eport()],
    status: 'implemented',
    difficulty: 'basic',
    runtime: ({ inputs }) => {
      if (!Array.isArray(inputs.array)) return { error: ERR.INVALID_JSON };
      return { outputs: { value: inputs.array.length } };
    },
    ui: { icon: '#]', color: '#a3e635' },
  },
  {
    id: 'data.array_join',
    labelKey: 'blocks.data.array_join.label',
    descriptionKey: 'blocks.data.array_join.description',
    keywords: ['массив', 'склеить', 'текст', 'разделитель'],
    category: 'data',
    subcategory: 'Массивы',
    inputs: [dport('array', 'blocks.ports.array', 'array')],
    outputs: [dport('text', 'blocks.ports.text', 'text'), eport()],
    defaults: { separator: ', ' },
    status: 'implemented',
    difficulty: 'basic',
    runtime: ({ inputs, config }) => {
      if (!Array.isArray(inputs.array)) return { error: ERR.INVALID_JSON };
      return { outputs: { text: inputs.array.map((v) => String(v)).join(String(config.separator ?? ', ')) } };
    },
    ui: { icon: ']→Т', color: '#a3e635' },
  },
  {
    id: 'data.array_slice',
    labelKey: 'blocks.data.array_slice.label',
    descriptionKey: 'blocks.data.array_slice.description',
    keywords: ['массив', 'срез', 'часть', 'диапазон'],
    category: 'data',
    subcategory: 'Массивы',
    inputs: [dport('array', 'blocks.ports.array', 'array')],
    outputs: [dport('array', 'blocks.ports.array', 'array'), eport()],
    defaults: { start: 0, end: 10 },
    status: 'implemented',
    difficulty: 'advanced',
    runtime: ({ inputs, config }) => {
      if (!Array.isArray(inputs.array)) return { error: ERR.INVALID_JSON };
      return { outputs: { array: inputs.array.slice(Number(config.start ?? 0), Number(config.end ?? 10)) } };
    },
    ui: { icon: '[a:b]', color: '#a3e635' },
  },
  {
    id: 'data.array_sort',
    labelKey: 'blocks.data.array_sort.label',
    descriptionKey: 'blocks.data.array_sort.description',
    keywords: ['массив', 'сортировка', 'упорядочить'],
    category: 'data',
    subcategory: 'Массивы',
    inputs: [dport('array', 'blocks.ports.array', 'array')],
    outputs: [dport('array', 'blocks.ports.array', 'array'), eport()],
    status: 'implemented',
    difficulty: 'advanced',
    runtime: ({ inputs }) => {
      if (!Array.isArray(inputs.array)) return { error: ERR.INVALID_JSON };
      const allNumbers = inputs.array.every((v) => typeof v === 'number' || !Number.isNaN(Number(v)));
      const sorted = [...inputs.array].sort((a, b) =>
        allNumbers ? Number(a) - Number(b) : String(a).localeCompare(String(b), 'ru'),
      );
      return { outputs: { array: sorted } };
    },
    ui: { icon: '↑↓', color: '#a3e635' },
  },
];
