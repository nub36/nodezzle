/** Категория «Ядро» (core): базовые детали значений и входа/выхода моделей. */

import type { BlockDefinition } from '@/core/types/blocks';
import { dport } from '../shared';

export const coreBlocks: BlockDefinition[] = [
  {
    id: 'core.text',
    labelKey: 'blocks.core.text.label',
    descriptionKey: 'blocks.core.text.description',
    category: 'core',
    inputs: [],
    outputs: [dport('text', 'blocks.ports.text', 'text')],
    defaults: { value: 'Текст' },
    runtime: ({ config }) => ({ outputs: { text: String(config.value ?? '') } }),
    ui: { icon: '📝', color: '#22d3ee' },
  },
  {
    id: 'core.number',
    labelKey: 'blocks.core.number.label',
    descriptionKey: 'blocks.core.number.description',
    category: 'core',
    inputs: [],
    outputs: [dport('value', 'blocks.ports.value', 'number')],
    defaults: { value: 0 },
    runtime: ({ config }) => {
      const n = Number(config.value);
      if (Number.isNaN(n)) return { error: 'ERR_INVALID_NUMBER' };
      return { outputs: { value: n } };
    },
    ui: { icon: '🔢', color: '#a78bfa' },
  },
  {
    id: 'core.json',
    labelKey: 'blocks.core.json.label',
    descriptionKey: 'blocks.core.json.description',
    category: 'core',
    inputs: [],
    outputs: [dport('value', 'blocks.ports.value', 'json')],
    defaults: { value: '{"ok": true}' },
    runtime: ({ config }) => {
      const raw = String(config.value ?? '');
      try {
        return { outputs: { value: JSON.parse(raw) } };
      } catch {
        return { error: 'ERR_INVALID_JSON' };
      }
    },
    ui: { icon: '🧾', color: '#a3e635' },
  },
  {
    id: 'core.input',
    labelKey: 'blocks.core.input.label',
    descriptionKey: 'blocks.core.input.description',
    category: 'core',
    entry: true,
    inputs: [],
    outputs: [dport('value', 'blocks.ports.value', 'any')],
    defaults: { portId: '' },
    runtime: ({ payload, config }) => {
      const portId = String(config.portId ?? '');
      const value = payload.model?.inputs?.[portId];
      return { outputs: { value: value ?? null } };
    },
    ui: { icon: '⤵️', color: '#34d399' },
  },
  {
    id: 'core.output',
    labelKey: 'blocks.core.output.label',
    descriptionKey: 'blocks.core.output.description',
    category: 'core',
    inputs: [dport('value', 'blocks.ports.value', 'any')],
    outputs: [],
    defaults: { portId: '' },
    runtime: ({ inputs, config, runtime }) => {
      const portId = String(config.portId ?? '');
      if (portId && runtime.modelOutputs) {
        runtime.modelOutputs[portId] = inputs.value ?? null;
      }
      return { outputs: {} };
    },
    ui: { icon: '⤴️', color: '#34d399' },
  },
];
