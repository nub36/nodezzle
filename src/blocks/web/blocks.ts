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

/** Без event сохраняем общий запуск симулятора старых схем; явное событие адресуем по типу. */
const webMatches = (event: string) => (payload: TriggerPayload) =>
  (payload.source === undefined || payload.source === 'web') &&
  (payload.web?.event === undefined || payload.web.event === event);

export const webBlocks: BlockDefinition[] = [
  {
    id: 'web.page',
    labelKey: 'blocks.web.page.label',
    descriptionKey: 'blocks.web.page.description',
    keywords: ['веб', 'страница', 'сайт', 'загрузка', 'экран'],
    category: 'web_events',
    difficulty: 'basic',
    trigger: true,
    inputs: [],
    outputs: [dport('data', 'blocks.ports.data', 'object')],
    matches: webMatches('page_load'),
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
    keywords: ['веб', 'кнопка', 'клик', 'нажатие'],
    category: 'web_events',
    difficulty: 'basic',
    trigger: true,
    inputs: [],
    outputs: [dport('data', 'blocks.ports.data', 'object')],
    matches: webMatches('button_click'),
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
    keywords: ['веб', 'форма', 'ввод', 'отправка'],
    category: 'web_events',
    difficulty: 'advanced',
    trigger: true,
    defaults: { formMode: 'json' },
    inputs: [],
    outputs: [dport('data', 'blocks.ports.data', 'object')],
    matches: webMatches('form_submit'),
    runtime: ({ payload, runtime }) => {
      const values = (payload.web?.values as Record<string, unknown>) ?? payload.web ?? {};
      runtime.log('info', 'web.form_submit', { values });
      return { outputs: { data: values } };
    },
    ui: { icon: '📋', color: '#f472b6' },
  },
];
