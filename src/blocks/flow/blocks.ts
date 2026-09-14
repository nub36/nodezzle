/** Категория «Поток» (flow): управление временем выполнения. */

import type { BlockDefinition } from '@/core/types/blocks';
import { sleepWithCancel } from '@/core/runtime/execute';
import { dport, ERR } from '../shared';

export const flowBlocks: BlockDefinition[] = [
  {
    id: 'flow.delay',
    labelKey: 'blocks.flow.delay.label',
    descriptionKey: 'blocks.flow.delay.description',
    keywords: ['задержка', 'пауза', 'ожидание', 'таймер', 'сон'],
    category: 'flow',
    inputs: [dport('value', 'blocks.ports.value', 'any')],
    outputs: [dport('value', 'blocks.ports.value', 'any')],
    defaults: { delayMs: 500 },
    runtime: async ({ inputs, config, runtime }) => {
      const ms = Math.max(0, Math.min(60000, Number(config.delayMs ?? 500)));
      try {
        await sleepWithCancel(ms, runtime.cancel);
      } catch (e) {
        return { error: e instanceof Error && e.message === ERR.CANCELLED ? ERR.CANCELLED : ERR.RUNTIME };
      }
      return { outputs: { value: inputs.value ?? null } };
    },
    ui: { icon: '⏱️', color: '#fbbf24' },
  },
];
