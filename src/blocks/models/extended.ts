/**
 * Вспомогательные детали моделей (Этап 4, часть D).
 *
 * Подготовка входа модели, разбор результата, значения по умолчанию,
 * проверка контракта и разбор ошибок. Часть исполняется уже сейчас
 * (чистые преобразования), часть — запланирована до появления
 * соответствующих механизмов ядра.
 */

import type { BlockDefinition } from '@/core/types/blocks';
import { dport, eport, ERR } from '../shared';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export const modelExtendedBlocks: BlockDefinition[] = [
  {
    id: 'models.prepare',
    version: '1',
    labelKey: 'blocks.models.prepare.label',
    descriptionKey: 'blocks.models.prepare.description',
    keywords: ['модель', 'вход', 'подготовка', 'объект', 'контракт'],
    category: 'models',
    subcategory: 'вход',
    difficulty: 'basic',
    status: 'implemented',
    inputs: [dport('value', 'blocks.ports.value', 'any')],
    outputs: [dport('payload', 'blocks.ports.payload', 'object')],
    defaults: { field: 'value' },
    runtime: ({ inputs, config }) => {
      const field = String(config.field ?? 'value').trim() || 'value';
      return { outputs: { payload: { [field]: inputs.value ?? null } } };
    },
    ui: { icon: '🎁', color: '#34d399' },
  },
  {
    id: 'models.extract',
    version: '1',
    labelKey: 'blocks.models.extract.label',
    descriptionKey: 'blocks.models.extract.description',
    keywords: ['модель', 'результат', 'поле', 'извлечь', 'вывод'],
    category: 'models',
    subcategory: 'результат',
    difficulty: 'basic',
    status: 'implemented',
    inputs: [dport('result', 'blocks.ports.result', 'object')],
    outputs: [dport('value', 'blocks.ports.value', 'any'), eport()],
    defaults: { field: 'result', required: false },
    runtime: ({ inputs, config }) => {
      const result = isPlainObject(inputs.result) ? inputs.result : {};
      const field = String(config.field ?? 'result').trim() || 'result';
      const value = result[field];
      if (value === undefined) {
        if (Boolean(config.required)) return { error: ERR.KEY_NOT_FOUND };
        return { outputs: { value: null } };
      }
      return { outputs: { value } };
    },
    ui: { icon: '📤', color: '#34d399' },
  },
  {
    id: 'models.fallback',
    version: '1',
    labelKey: 'blocks.models.fallback.label',
    descriptionKey: 'blocks.models.fallback.description',
    keywords: ['модель', 'резерв', 'значение по умолчанию', 'запасной'],
    category: 'models',
    subcategory: 'результат',
    difficulty: 'basic',
    status: 'implemented',
    inputs: [
      dport('value', 'blocks.ports.value', 'any'),
      dport('fallback', 'blocks.ports.fallback', 'any'),
    ],
    outputs: [dport('result', 'blocks.ports.result', 'any')],
    runtime: ({ inputs }) => {
      const empty = inputs.value === undefined || inputs.value === null || inputs.value === '';
      return { outputs: { result: empty ? inputs.fallback ?? null : inputs.value } };
    },
    ui: { icon: '🛟', color: '#34d399' },
  },
  {
    id: 'models.validate',
    version: '1',
    labelKey: 'blocks.models.validate.label',
    descriptionKey: 'blocks.models.validate.description',
    keywords: ['модель', 'проверка', 'валидация', 'контракт', 'поля'],
    category: 'models',
    subcategory: 'контракт',
    difficulty: 'advanced',
    status: 'implemented',
    inputs: [dport('result', 'blocks.ports.result', 'object')],
    outputs: [
      dport('valid', 'blocks.ports.valid', 'boolean'),
      dport('missing', 'blocks.ports.missing', 'text'),
    ],
    defaults: { fields: '' },
    runtime: ({ inputs, config }) => {
      const result = isPlainObject(inputs.result) ? inputs.result : {};
      const fields = String(config.fields ?? '')
        .split(',')
        .map((f) => f.trim())
        .filter((f) => f !== '');
      const missing = fields.filter((f) => result[f] === undefined || result[f] === null);
      return { outputs: { valid: missing.length === 0, missing: missing.join(', ') } };
    },
    ui: { icon: '🧪', color: '#34d399' },
  },
  {
    id: 'models.map_error',
    version: '1',
    labelKey: 'blocks.models.map_error.label',
    descriptionKey: 'blocks.models.map_error.description',
    keywords: ['модель', 'ошибка', 'разбор', 'сообщение', 'текст'],
    category: 'models',
    subcategory: 'ошибки',
    difficulty: 'advanced',
    status: 'implemented',
    inputs: [dport('error', 'blocks.ports.error', 'any')],
    outputs: [dport('message', 'blocks.ports.message', 'text')],
    runtime: ({ inputs }) => {
      const e = inputs.error;
      let message = '';
      if (typeof e === 'string') message = e;
      else if (isPlainObject(e)) message = String(e.message ?? e.code ?? '');
      if (message === '' && e !== undefined && e !== null) message = String(e);
      return { outputs: { message } };
    },
    ui: { icon: '🩹', color: '#34d399' },
  },
  {
    id: 'models.metadata',
    version: '1',
    labelKey: 'blocks.models.metadata.label',
    descriptionKey: 'blocks.models.metadata.description',
    keywords: ['модель', 'метаданные', 'время', 'длительность', 'статистика'],
    category: 'models',
    subcategory: 'результат',
    difficulty: 'advanced',
    status: 'planned',
    available: false,
    inputs: [dport('result', 'blocks.ports.result', 'object')],
    outputs: [
      dport('duration', 'blocks.ports.duration', 'number'),
      dport('created_at', 'blocks.ports.created_at', 'date'),
    ],
    ui: { icon: '🏷️', color: '#34d399' },
  },
  {
    id: 'models.list',
    version: '1',
    labelKey: 'blocks.models.list.label',
    descriptionKey: 'blocks.models.list.description',
    keywords: ['модель', 'список', 'перечень', 'проекты'],
    category: 'models',
    subcategory: 'справочник',
    difficulty: 'basic',
    status: 'planned',
    available: false,
    inputs: [],
    outputs: [dport('models', 'blocks.ports.models', 'array')],
    ui: { icon: '📚', color: '#34d399' },
  },
  {
    id: 'models.guard',
    version: '1',
    labelKey: 'blocks.models.guard.label',
    descriptionKey: 'blocks.models.guard.description',
    keywords: ['модель', 'защита', 'лимит', 'размер', 'ограничение'],
    category: 'models',
    subcategory: 'контракт',
    difficulty: 'advanced',
    status: 'planned',
    available: false,
    inputs: [dport('payload', 'blocks.ports.payload', 'object')],
    outputs: [dport('payload', 'blocks.ports.payload', 'object'), eport()],
    ui: { icon: '🛡️', color: '#34d399' },
  },
  {
    id: 'models.check',
    version: '1',
    labelKey: 'blocks.models.check.label',
    descriptionKey: 'blocks.models.check.description',
    keywords: ['модель', 'проверка', 'схема', 'формат', 'соответствие'],
    category: 'models',
    subcategory: 'контракт',
    difficulty: 'advanced',
    status: 'planned',
    available: false,
    inputs: [dport('result', 'blocks.ports.result', 'object')],
    outputs: [dport('valid', 'blocks.ports.valid', 'boolean')],
    ui: { icon: '✔️', color: '#34d399' },
  },
];
