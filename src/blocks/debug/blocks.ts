/**
 * Категория «Отладка» (debug): DEBUG/LOG-детали.
 * Архитектурно отладка присутствует на уровне ядра:
 * execution log, per-node inputs/outputs, история выполнения.
 */

import type { BlockDefinition } from '@/core/types/blocks';
import { dport } from '../shared';

export const debugBlocks: BlockDefinition[] = [
  {
    id: 'debug.log',
    labelKey: 'blocks.debug.log.label',
    descriptionKey: 'blocks.debug.log.description',
    keywords: ['отладка', 'лог', 'журнал', 'печать', 'вывод'],
    category: 'debug',
    inputs: [dport('value', 'blocks.ports.value', 'any')],
    outputs: [dport('value', 'blocks.ports.value', 'any')],
    defaults: { label: 'Значение' },
    runtime: ({ inputs, config, runtime }) => {
      const label = String(config.label ?? 'Значение');
      runtime.log('info', label, { value: inputs.value ?? null });
      return { outputs: { value: inputs.value ?? null } };
    },
    ui: { icon: '🐞', color: '#94a3b8' },
  },
];
