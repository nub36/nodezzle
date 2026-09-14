/**
 * Расширенные детали отладки (Этап 4, часть G).
 *
 * Пять деталей исполняются (логирование, утверждения, замер, счётчик),
 * четыре запланированы до появления точек останова и снапшотов
 * (см. «Точки останова (BREAKPOINT)» в docs/IMPLEMENTATION_MATRIX.md).
 */

import type { BlockDefinition } from '@/core/types/blocks';
import { dport, eport, ERR } from '../shared';

const debugColor = '#94a3b8';

export const debugExtendedBlocks: BlockDefinition[] = [
  {
    id: 'debug.inspect',
    version: '1',
    labelKey: 'blocks.debug.inspect.label',
    descriptionKey: 'blocks.debug.inspect.description',
    keywords: ['отладка', 'осмотр', 'значение', 'вывести', 'журнал'],
    category: 'debug',
    subcategory: 'наблюдение',
    difficulty: 'basic',
    status: 'implemented',
    inputs: [dport('value', 'blocks.ports.value', 'any')],
    outputs: [dport('value', 'blocks.ports.value', 'any')],
    defaults: { label: '' },
    runtime: ({ inputs, config, runtime }) => {
      const label = String(config.label ?? '').trim();
      runtime.log('debug', label !== '' ? `inspect: ${label}` : 'inspect', { value: inputs.value });
      return { outputs: { value: inputs.value } };
    },
    ui: { icon: '🔬', color: debugColor },
  },
  {
    id: 'debug.assert',
    version: '1',
    labelKey: 'blocks.debug.assert.label',
    descriptionKey: 'blocks.debug.assert.description',
    keywords: ['отладка', 'утверждение', 'проверка', 'ожидание', 'истина'],
    category: 'debug',
    subcategory: 'проверки',
    difficulty: 'advanced',
    status: 'implemented',
    inputs: [
      dport('value', 'blocks.ports.value', 'any'),
      dport('condition', 'blocks.ports.condition', 'boolean'),
    ],
    outputs: [dport('value', 'blocks.ports.value', 'any'), eport()],
    runtime: ({ inputs, runtime }) => {
      if (inputs.condition !== true) {
        runtime.log('warn', 'assert failed', { value: inputs.value });
        return { error: ERR.ASSERTION };
      }
      return { outputs: { value: inputs.value } };
    },
    ui: { icon: '🛑', color: debugColor },
  },
  {
    id: 'debug.trace',
    version: '1',
    labelKey: 'blocks.debug.trace.label',
    descriptionKey: 'blocks.debug.trace.description',
    keywords: ['отладка', 'трассировка', 'след', 'путь', 'журнал'],
    category: 'debug',
    subcategory: 'наблюдение',
    difficulty: 'advanced',
    status: 'implemented',
    inputs: [dport('value', 'blocks.ports.value', 'any')],
    outputs: [dport('value', 'blocks.ports.value', 'any')],
    defaults: { label: 'trace' },
    runtime: ({ inputs, config, runtime }) => {
      runtime.log('info', `trace: ${String(config.label ?? 'trace')}`, {
        at: new Date().toISOString(),
      });
      return { outputs: { value: inputs.value } };
    },
    ui: { icon: '🐾', color: debugColor },
  },
  {
    id: 'debug.measure',
    version: '1',
    labelKey: 'blocks.debug.measure.label',
    descriptionKey: 'blocks.debug.measure.description',
    keywords: ['отладка', 'замер', 'время', 'длительность', 'сколько шло'],
    category: 'debug',
    subcategory: 'замеры',
    difficulty: 'advanced',
    status: 'implemented',
    inputs: [
      dport('value', 'blocks.ports.value', 'any'),
      dport('start', 'blocks.ports.start', 'date'),
    ],
    outputs: [
      dport('value', 'blocks.ports.value', 'any'),
      dport('duration', 'blocks.ports.duration', 'number'),
    ],
    runtime: ({ inputs }) => {
      const start = typeof inputs.start === 'string' || typeof inputs.start === 'number'
        ? new Date(inputs.start).getTime()
        : NaN;
      const duration = Number.isFinite(start) ? Math.max(0, Date.now() - start) : 0;
      return { outputs: { value: inputs.value, duration } };
    },
    ui: { icon: '⏱️', color: debugColor },
  },
  {
    id: 'debug.counter',
    version: '1',
    labelKey: 'blocks.debug.counter.label',
    descriptionKey: 'blocks.debug.counter.description',
    keywords: ['отладка', 'счётчик', 'сколько раз', 'подсчёт'],
    category: 'debug',
    subcategory: 'замеры',
    difficulty: 'basic',
    status: 'implemented',
    inputs: [dport('value', 'blocks.ports.value', 'number')],
    outputs: [dport('value', 'blocks.ports.value', 'number'), eport()],
    defaults: { step: 1 },
    runtime: ({ inputs, config, runtime }) => {
      const value = Number(inputs.value);
      const step = Number(config.step);
      if (!Number.isFinite(value)) return { error: ERR.INVALID_NUMBER };
      runtime.log('debug', 'counter', { value: value + (Number.isFinite(step) ? step : 1) });
      return { outputs: { value: value + (Number.isFinite(step) ? step : 1) } };
    },
    ui: { icon: '🧮', color: debugColor },
  },
  {
    id: 'debug.breakpoint',
    version: '1',
    labelKey: 'blocks.debug.breakpoint.label',
    descriptionKey: 'blocks.debug.breakpoint.description',
    keywords: ['отладка', 'пауза', 'остановка', 'точка останова'],
    category: 'debug',
    subcategory: 'управление',
    difficulty: 'advanced',
    status: 'planned',
    available: false,
    inputs: [dport('value', 'blocks.ports.value', 'any')],
    outputs: [dport('value', 'blocks.ports.value', 'any')],
    ui: { icon: '⏸️', color: debugColor },
  },
  {
    id: 'debug.snapshot',
    version: '1',
    labelKey: 'blocks.debug.snapshot.label',
    descriptionKey: 'blocks.debug.snapshot.description',
    keywords: ['отладка', 'снимок', 'состояние', 'сохранить'],
    category: 'debug',
    subcategory: 'наблюдение',
    difficulty: 'advanced',
    status: 'planned',
    available: false,
    inputs: [dport('value', 'blocks.ports.value', 'any')],
    outputs: [dport('value', 'blocks.ports.value', 'any')],
    ui: { icon: '📸', color: debugColor },
  },
  {
    id: 'debug.watch',
    version: '1',
    labelKey: 'blocks.debug.watch.label',
    descriptionKey: 'blocks.debug.watch.description',
    keywords: ['отладка', 'наблюдение', 'следить', 'изменения'],
    category: 'debug',
    subcategory: 'наблюдение',
    difficulty: 'advanced',
    status: 'planned',
    available: false,
    inputs: [dport('value', 'blocks.ports.value', 'any')],
    outputs: [dport('value', 'blocks.ports.value', 'any')],
    ui: { icon: '👀', color: debugColor },
  },
  {
    id: 'debug.export_log',
    version: '1',
    labelKey: 'blocks.debug.export_log.label',
    descriptionKey: 'blocks.debug.export_log.description',
    keywords: ['отладка', 'журнал', 'экспорт', 'файл', 'скачать'],
    category: 'debug',
    subcategory: 'журнал',
    difficulty: 'advanced',
    status: 'planned',
    available: false,
    inputs: [],
    outputs: [dport('file', 'blocks.ports.file', 'file'), eport()],
    ui: { icon: '📃', color: debugColor },
  },
];
