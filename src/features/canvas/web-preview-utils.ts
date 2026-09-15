/**
 * Чистый разбор веб-деталей на холсте для превью страницы
 * (Этап 2, подэтап I часть 2). Не зависит от React.
 *
 * Здесь только триггерный слой (страница/кнопка/форма).
 * Элементы оформления/поля 09B1–B4 собирает useWebPreviewElements.
 */

import type { NodezzleFlowNode } from '@/core/project/serialize';
import type { BlockDefinition } from '@/core/types/blocks';

export interface WebElementInfo {
  nodeId: string;
  /** Подпись экземпляра (переименовка или подпись блока). */
  label: string;
}

export interface WebElements {
  page: WebElementInfo | null;
  buttons: WebElementInfo[];
  forms: WebElementInfo[];
}

export function collectWebElements(
  nodes: NodezzleFlowNode[],
  getBlock: (id: string) => BlockDefinition | undefined,
  blockLabel: (labelKey: string) => string,
): WebElements {
  const result: WebElements = { page: null, buttons: [], forms: [] };
  for (const node of nodes) {
    const def = getBlock(node.data.blockId);
    if (!def || !def.category.startsWith('web')) continue;
    const label =
      node.data.label ??
      (typeof node.data.config.label === 'string' && node.data.config.label.trim() !== ''
        ? node.data.config.label
        : blockLabel(def.labelKey));
    const info: WebElementInfo = { nodeId: node.id, label };
    if (node.data.blockId === 'web.page') {
      if (!result.page) result.page = info;
    } else if (node.data.blockId === 'web.button') {
      result.buttons.push(info);
    } else if (node.data.blockId === 'web.form') {
      result.forms.push(info);
    }
  }
  return result;
}
