/**
 * Служебная категория «Заметки» (Этап 2, подэтап F).
 *
 * Стикер-заметка — комментарий на Canvas. Не участвует в выполнении:
 * портов нет, рантайма нет (узлы без обработчика проходят выполнение
 * с пустыми выходами), в палитре скрыта (available: false) — вставляется
 * через контекстное меню.
 */

import type { BlockDefinition } from '@/core/types/blocks';

export const noteBlocks: BlockDefinition[] = [
  {
    id: 'note.sticky',
    labelKey: 'blocks.note.sticky.label',
    descriptionKey: 'blocks.note.sticky.description',
    category: 'notes',
    difficulty: 'basic',
    available: false,
    keywords: ['заметка', 'стикер', 'комментарий', 'подпись'],
    inputs: [],
    outputs: [],
    defaults: { text: '' },
    ui: { icon: '📝', color: '#fbbf24' },
  },
];
