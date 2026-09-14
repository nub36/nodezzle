/**
 * Категория «Логика» — операторы и проверки (Этап 4, часть A).
 * Чистые функции над значениями; без внешних систем.
 */

import type { BlockDefinition } from '@/core/types/blocks';
import { dport } from '../shared';

const truthy = (v: unknown): boolean =>
  v === true || v === 1 || v === 'true' || v === 'да' || v === '1';

const compareValues = (left: unknown, operator: string, right: unknown): boolean => {
  const l = left as number | string;
  const r = right as number | string;
  switch (operator) {
    case 'not_equals':
      return l !== r;
    case 'gt':
      return Number(l) > Number(r);
    case 'lt':
      return Number(l) < Number(r);
    case 'gte':
      return Number(l) >= Number(r);
    case 'lte':
      return Number(l) <= Number(r);
    case 'contains':
      return String(left ?? '').toLowerCase().includes(String(right ?? '').toLowerCase());
    default:
      return l === r;
  }
};

export const logicOperatorBlocks: BlockDefinition[] = [
  {
    id: 'logic.compare',
    labelKey: 'blocks.logic.compare.label',
    descriptionKey: 'blocks.logic.compare.description',
    keywords: ['сравнение', 'равно', 'больше', 'меньше', 'содержит'],
    category: 'logic',
    subcategory: 'Операторы',
    inputs: [dport('left', 'blocks.ports.left', 'any'), dport('right', 'blocks.ports.right', 'any')],
    outputs: [dport('result', 'blocks.ports.result', 'boolean')],
    defaults: { operator: 'equals' },
    status: 'implemented',
    difficulty: 'basic',
    runtime: ({ inputs, config }) => ({
      outputs: { result: compareValues(inputs.left, String(config.operator ?? 'equals'), inputs.right) },
    }),
    ui: { icon: '⚖️', color: '#a78bfa' },
  },
  {
    id: 'logic.and',
    labelKey: 'blocks.logic.and.label',
    descriptionKey: 'blocks.logic.and.description',
    keywords: ['и', 'логическое', 'оба', 'условие'],
    category: 'logic',
    subcategory: 'Операторы',
    inputs: [dport('a', 'blocks.ports.a', 'boolean'), dport('b', 'blocks.ports.b', 'boolean')],
    outputs: [dport('result', 'blocks.ports.result', 'boolean')],
    status: 'implemented',
    difficulty: 'basic',
    runtime: ({ inputs }) => ({ outputs: { result: truthy(inputs.a) && truthy(inputs.b) } }),
    ui: { icon: '&', color: '#a78bfa' },
  },
  {
    id: 'logic.or',
    labelKey: 'blocks.logic.or.label',
    descriptionKey: 'blocks.logic.or.description',
    keywords: ['или', 'логическое', 'любое', 'условие'],
    category: 'logic',
    subcategory: 'Операторы',
    inputs: [dport('a', 'blocks.ports.a', 'boolean'), dport('b', 'blocks.ports.b', 'boolean')],
    outputs: [dport('result', 'blocks.ports.result', 'boolean')],
    status: 'implemented',
    difficulty: 'basic',
    runtime: ({ inputs }) => ({ outputs: { result: truthy(inputs.a) || truthy(inputs.b) } }),
    ui: { icon: '≥1', color: '#a78bfa' },
  },
  {
    id: 'logic.not',
    labelKey: 'blocks.logic.not.label',
    descriptionKey: 'blocks.logic.not.description',
    keywords: ['не', 'инверсия', 'отрицание', 'логическое'],
    category: 'logic',
    subcategory: 'Операторы',
    inputs: [dport('value', 'blocks.ports.value', 'boolean')],
    outputs: [dport('result', 'blocks.ports.result', 'boolean')],
    status: 'implemented',
    difficulty: 'basic',
    runtime: ({ inputs }) => ({ outputs: { result: !truthy(inputs.value) } }),
    ui: { icon: '¬', color: '#a78bfa' },
  },
  {
    id: 'logic.xor',
    labelKey: 'blocks.logic.xor.label',
    descriptionKey: 'blocks.logic.xor.description',
    keywords: ['исключающее', 'или', 'ровно одно', 'логическое'],
    category: 'logic',
    subcategory: 'Операторы',
    inputs: [dport('a', 'blocks.ports.a', 'boolean'), dport('b', 'blocks.ports.b', 'boolean')],
    outputs: [dport('result', 'blocks.ports.result', 'boolean')],
    status: 'implemented',
    difficulty: 'advanced',
    runtime: ({ inputs }) => ({ outputs: { result: truthy(inputs.a) !== truthy(inputs.b) } }),
    ui: { icon: '⊕', color: '#a78bfa' },
  },
  {
    id: 'logic.is_empty',
    labelKey: 'blocks.logic.is_empty.label',
    descriptionKey: 'blocks.logic.is_empty.description',
    keywords: ['пусто', 'проверка', 'нет значения', 'отсутствует'],
    category: 'logic',
    subcategory: 'Проверки',
    inputs: [dport('value', 'blocks.ports.value', 'any')],
    outputs: [dport('result', 'blocks.ports.result', 'boolean')],
    status: 'implemented',
    difficulty: 'basic',
    runtime: ({ inputs }) => {
      const v = inputs.value;
      const empty =
        v === undefined || v === null || v === '' ||
        (Array.isArray(v) && v.length === 0) ||
        (typeof v === 'object' && Object.keys(v as object).length === 0);
      return { outputs: { result: empty } };
    },
    ui: { icon: '∅', color: '#a78bfa' },
  },
  {
    id: 'logic.in_range',
    labelKey: 'blocks.logic.in_range.label',
    descriptionKey: 'blocks.logic.in_range.description',
    keywords: ['диапазон', 'между', 'границы', 'проверка'],
    category: 'logic',
    subcategory: 'Проверки',
    inputs: [dport('value', 'blocks.ports.value', 'number')],
    outputs: [dport('result', 'blocks.ports.result', 'boolean')],
    defaults: { min: 0, max: 100 },
    status: 'implemented',
    difficulty: 'advanced',
    runtime: ({ inputs, config }) => {
      const n = Number(inputs.value);
      if (Number.isNaN(n)) return { outputs: { result: false } };
      return { outputs: { result: n >= Number(config.min ?? 0) && n <= Number(config.max ?? 100) } };
    },
    ui: { icon: '↔', color: '#a78bfa' },
  },
  {
    id: 'logic.coalesce',
    labelKey: 'blocks.logic.coalesce.label',
    descriptionKey: 'blocks.logic.coalesce.description',
    keywords: ['первое непустое', 'запасное', 'значение по умолчанию'],
    category: 'logic',
    subcategory: 'Операторы',
    inputs: [dport('a', 'blocks.ports.a', 'any'), dport('b', 'blocks.ports.b', 'any')],
    outputs: [dport('result', 'blocks.ports.result', 'any')],
    status: 'implemented',
    difficulty: 'advanced',
    runtime: ({ inputs }) => {
      const pick = (v: unknown) => v !== undefined && v !== null && v !== '';
      return { outputs: { result: pick(inputs.a) ? inputs.a : inputs.b } };
    },
    ui: { icon: '??', color: '#a78bfa' },
  },
];
