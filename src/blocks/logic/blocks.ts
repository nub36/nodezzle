/** Категория «Логика» (logic): условия и ветвление. */

import type { BlockDefinition } from '@/core/types/blocks';
import { dport } from '../shared';

export const CONDITION_OPERATORS = [
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'is_empty',
  'not_empty',
  'greater',
  'less',
] as const;

function evaluateCondition(value: unknown, operator: string, target: string): boolean {
  const s = value === undefined || value === null ? '' : String(value);
  const n = Number(s);
  const t = Number(target);
  switch (operator) {
    case 'equals':
      return s === target;
    case 'notEquals':
      return s !== target;
    case 'contains':
      return s.includes(target);
    case 'notContains':
      return !s.includes(target);
    case 'is_empty':
      return s.trim() === '';
    case 'not_empty':
      return s.trim() !== '';
    case 'greater':
      return Number.isFinite(n) && Number.isFinite(t) && n > t;
    case 'less':
      return Number.isFinite(n) && Number.isFinite(t) && n < t;
    default:
      return false;
  }
}

export const logicBlocks: BlockDefinition[] = [
  {
    id: 'logic.condition',
    labelKey: 'blocks.logic.condition.label',
    descriptionKey: 'blocks.logic.condition.description',
    keywords: ['условие', 'если', 'ветвление', 'сравнение', 'ветка'],
    category: 'logic',
    inputs: [dport('value', 'blocks.ports.value', 'any')],
    outputs: [dport('true', 'blocks.ports.true', 'any'), dport('false', 'blocks.ports.false', 'any')],
    defaults: { operator: 'equals', target: '', trueValue: '', falseValue: '' },
    runtime: ({ inputs, config }) => {
      const value = inputs.value;
      const operator = String(config.operator ?? 'equals');
      const target = config.target === undefined || config.target === null ? '' : String(config.target);
      const ok = evaluateCondition(value, operator, target);
      // Если задано значение ветки — выдаём его, иначе пропускаем входное.
      const branchValue = (v: unknown) => (v === undefined || v === '' ? value : v);
      if (ok) return { outputs: { true: branchValue(config.trueValue) } };
      return { outputs: { false: branchValue(config.falseValue) } };
    },
    ui: { icon: '⑂', color: '#a78bfa' },
  },
  {
    id: 'logic.switch',
    labelKey: 'blocks.logic.switch.label',
    descriptionKey: 'blocks.logic.switch.description',
    keywords: ['переключатель', 'выбор', 'случай', 'вариант'],
    category: 'logic',
    inputs: [dport('value', 'blocks.ports.value', 'any')],
    outputs: [
      dport('case_1', 'blocks.ports.case_1', 'any'),
      dport('case_2', 'blocks.ports.case_2', 'any'),
      dport('case_3', 'blocks.ports.case_3', 'any'),
      dport('other', 'blocks.ports.other', 'any'),
    ],
    defaults: { case_1: '', case_2: '', case_3: '' },
    runtime: ({ inputs, config }) => {
      const s = String(inputs.value ?? '');
      for (const id of ['case_1', 'case_2', 'case_3'] as const) {
        const v = config[id];
        if (v !== undefined && v !== null && String(v) !== '' && s === String(v)) {
          return { outputs: { [id]: inputs.value } };
        }
      }
      return { outputs: { other: inputs.value } };
    },
    ui: { icon: '⑃', color: '#a78bfa' },
  },
];
