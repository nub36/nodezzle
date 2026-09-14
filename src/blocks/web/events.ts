/**
 * Дополнительные события веб-страницы (Этап 4, часть C).
 *
 * Работают по той же схеме, что и существующие веб-триггеры: источник
 * исполнения `source: 'web'`, данные — в `payload.web`. Если в событии
 * указан вид (`payload.web.event`), триггер срабатывает только на него;
 * без вида (симулятор) — как сегодня, на любое веб-событие
 * (см. «Известные ограничения» в docs/WEB_PREVIEW.md).
 */

import type { BlockDefinition } from '@/core/types/blocks';
import type { NodeExecutionContext, TriggerPayload } from '@/core/types/runtime';
import { dport } from '../shared';

function webEventMatches(event: string) {
  return (payload: TriggerPayload) => {
    if (payload.source !== undefined && payload.source !== 'web') return false;
    const kind = payload.web?.event;
    return kind === undefined || kind === event;
  };
}

function webEventRuntime(event: string) {
  return ({ payload, runtime }: NodeExecutionContext) => {
    runtime.log('info', `web.${event}`, { data: payload.web ?? {} });
    return { outputs: { data: payload.web ?? {} } };
  };
}

function webEventDef(
  id: string,
  event: string,
  icon: string,
  difficulty: 'basic' | 'advanced',
  keywords: string[],
  extra?: Partial<BlockDefinition>,
): BlockDefinition {
  return {
    id,
    version: '1',
    labelKey: `blocks.${id}.label`,
    descriptionKey: `blocks.${id}.description`,
    keywords,
    category: 'web_events',
    subcategory: 'события страницы',
    difficulty,
    trigger: true,
    inputs: [],
    outputs: [dport('data', 'blocks.ports.data', 'object')],
    matches: webEventMatches(event),
    runtime: webEventRuntime(event),
    ui: { icon, color: '#fb7185' },
    ...extra,
  };
}

export const webEventBlocks: BlockDefinition[] = [
  webEventDef('web.input_change', 'input_change', '⌨️', 'basic',
    ['веб', 'поле', 'ввод', 'изменение', 'форма']),
  webEventDef('web.modal_open', 'modal_open', '🪟', 'advanced',
    ['веб', 'окно', 'модальное', 'открыто', 'попап']),
  webEventDef('web.modal_close', 'modal_close', '🚪', 'advanced',
    ['веб', 'окно', 'модальное', 'закрыто', 'попап']),
  webEventDef('web.link_click', 'link_click', '🔗', 'basic',
    ['веб', 'ссылка', 'клик', 'переход']),
  webEventDef('web.scroll', 'scroll', '📜', 'advanced',
    ['веб', 'прокрутка', 'скролл', 'страница']),
  webEventDef('web.keypress', 'keypress', '⌨️', 'advanced',
    ['веб', 'клавиша', 'нажатие', 'клавиатура']),
  webEventDef('web.resize', 'resize', '↔️', 'advanced',
    ['веб', 'размер', 'окно', 'масштаб']),
];
