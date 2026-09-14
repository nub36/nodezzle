/**
 * Категория «Модели» (models).
 *
 * «Вызов модели» — механизм взаимодействия моделей:
 * входной объект маппится на контракт модели (INPUT),
 * результаты — на её OUTPUT. Модель внутри модели поддерживается
 * (рекурсивное выполнение, см. docs/MODELS.md).
 */

import type { BlockDefinition } from '@/core/types/blocks';
import type { StoredModel } from '@/core/project/schema';
import { dport, eport, ERR } from '../shared';

export const modelBlocks: BlockDefinition[] = [
  {
    id: 'models.call',
    labelKey: 'blocks.models.call.label',
    descriptionKey: 'blocks.models.call.description',
    keywords: ['модель', 'вызов', 'подсхема', 'подпрограмма'],
    category: 'models',
    difficulty: 'advanced',
    inputs: [dport('payload', 'blocks.ports.payload', 'object')],
    outputs: [dport('result', 'blocks.ports.result', 'object'), eport()],
    defaults: { modelId: '' },
    runtime: async ({ inputs, config, runtime }) => {
      const modelId = String(config.modelId ?? '');
      const model: StoredModel | undefined = modelId ? runtime.models?.[modelId] : undefined;
      if (!model) return { error: ERR.MODEL_NOT_FOUND };
      if (!runtime.executeModel) return { error: ERR.RUNTIME };

      const source = (inputs.payload ?? {}) as Record<string, unknown>;
      const modelInputs: Record<string, unknown> = {};
      for (const input of model.contract.inputs) {
        modelInputs[input.id] = source[input.id];
      }
      try {
        const outputs = await runtime.executeModel(modelId, modelInputs);
        return { outputs: { result: outputs } };
      } catch (e) {
        const code = e instanceof Error && e.message.startsWith('ERR_') ? e.message : ERR.MODEL_EXECUTION;
        return { error: code };
      }
    },
    ui: { icon: '📦', color: '#34d399' },
  },
];
