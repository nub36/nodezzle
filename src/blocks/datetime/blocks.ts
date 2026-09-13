/** Категория «Дата и время» (datetime). */

import type { BlockDefinition } from '@/core/types/blocks';
import { dport } from '../shared';

export const datetimeBlocks: BlockDefinition[] = [
  {
    id: 'datetime.now',
    labelKey: 'blocks.datetime.now.label',
    descriptionKey: 'blocks.datetime.now.description',
    category: 'datetime',
    inputs: [],
    outputs: [dport('value', 'blocks.ports.value', 'date')],
    runtime: () => ({ outputs: { value: new Date().toISOString() } }),
    ui: { icon: '🕑', color: '#38bdf8' },
  },
];
