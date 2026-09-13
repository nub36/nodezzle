/**
 * Категория «Web» (web).
 *
 * Web Layer поверх общего ядра: элементы страницы (PAGE, BUTTON, FORM…)
 * являются триггерами событий (Page Load, Button Click, Form Submit)
 * и используют те же INPUT/OUTPUT, что и Telegram.
 *
 * Сейчас события симулируются (payload.web); рендеринг собранной
 * страницы и живое превью — следующие этапы (см. docs/WEB.md).
 */

import type { BlockDefinition } from '@/core/types/blocks';
import type { TriggerPayload } from '@/core/types/runtime';
import { dport } from '../shared';

const webMatches = (payload: TriggerPayload) => payload.source === undefined || payload.source === 'web';

export const webBlocks: BlockDefinition[] = [
  {
    id: 'web.page',
    labelKey: 'blocks.web.page.label',
    descriptionKey: 'blocks.web.page.description',
    category: 'web',
    trigger: true,
    inputs: [],
    outputs: [dport('data', 'blocks.ports.data', 'object')],
    matches: webMatches,
    runtime: ({ payload, runtime }) => {
      runtime.log('info', 'web.page_load', { data: payload.web ?? {} });
      return { outputs: { data: payload.web ?? {} } };
    },
    ui: { icon: '🌐', color: '#f472b6' },
  },
  {
    id: 'web.button',
    labelKey: 'blocks.web.button.label',
    descriptionKey: 'blocks.web.button.description',
    category: 'web',
    trigger: true,
    inputs: [],
    outputs: [dport('data', 'blocks.ports.data', 'object')],
    matches: webMatches,
    runtime: ({ payload, runtime }) => {
      runtime.log('info', 'web.button_click', { data: payload.web ?? {} });
      return { outputs: { data: payload.web ?? {} } };
    },
    ui: { icon: '🔘', color: '#f472b6' },
  },
  {
    id: 'web.form',
    labelKey: 'blocks.web.form.label',
    descriptionKey: 'blocks.web.form.description',
    category: 'web',
    trigger: true,
    inputs: [],
    outputs: [dport('data', 'blocks.ports.data', 'object')],
    matches: webMatches,
    runtime: ({ payload, runtime }) => {
      const values = (payload.web?.values as Record<string, unknown>) ?? payload.web ?? {};
      runtime.log('info', 'web.form_submit', { values });
      return { outputs: { data: values } };
    },
    ui: { icon: '📋', color: '#f472b6' },
  },
];
