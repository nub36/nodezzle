/** Безопасный переносимый контракт дерева. Не содержит DOM или исполняемого HTML; поля могут адресовать форму по ID. */
import { readFieldElement, type WebFieldElement } from './field-element';
import { readUrlElement, type WebUrlElement } from './url-element';
import { readTextElement, type WebTextElement } from './text-element';

export type LayoutKind = 'container' | 'section' | 'grid' | 'modal';
export type WebElement = WebTextElement | WebUrlElement | WebFieldElement
  | { kind: 'container'; children: WebElement[] }
  | { kind: 'section'; title: string; children: WebElement[] }
  | { kind: 'grid'; columns: number; children: WebElement[] }
  | { kind: 'modal'; title: string; children: WebElement[] };

export const WEB_TREE_LIMITS = { depth: 16, nodes: 256, text: 65536 } as const;

/** Возвращает новую очищенную копию или null. Никаких частично принятых деревьев. */
export function readWebElement(value: unknown): WebElement | null {
  let remaining = WEB_TREE_LIMITS.nodes as number;
  let textBudget = WEB_TREE_LIMITS.text as number;
  const path = new Set<object>();
  const read = (raw: unknown, depth: number, inModal = false): WebElement | null => {
    if (depth > WEB_TREE_LIMITS.depth || --remaining < 0 || !raw || typeof raw !== 'object' || Array.isArray(raw) || path.has(raw)) return null;
    const obj = raw as Record<string, unknown>;
    if (inModal && (obj.kind === 'modal' || obj.kind === 'input' || obj.kind === 'textarea')) return null;
    if (obj.kind === 'text' || obj.kind === 'heading') {
      const leaf = readTextElement(obj);
      if (!leaf || (textBudget -= leaf.text.length) < 0) return null;
      return leaf;
    }
    if (obj.kind === 'image' || obj.kind === 'link') {
      const leaf = readUrlElement(obj);
      if (!leaf) return null;
      const size = leaf.kind === 'image' ? leaf.src.length + leaf.caption.length : leaf.href.length + leaf.text.length;
      if ((textBudget -= size) < 0) return null;
      return leaf;
    }
    if (obj.kind === 'input' || obj.kind === 'textarea') {
      const field = readFieldElement(obj);
      if (!field || (textBudget -= field.name.length + field.formNodeId.length + field.label.length + field.placeholder.length + field.value.length) < 0) return null;
      return field;
    }
    if (obj.kind !== 'container' && obj.kind !== 'section' && obj.kind !== 'grid' && obj.kind !== 'modal') return null;
    if (!Array.isArray(obj.children) || obj.children.length > remaining) return null;
    if ((obj.kind === 'section' || obj.kind === 'modal') && (typeof obj.title !== 'string' || (textBudget -= obj.title.length) < 0)) return null;
    if (obj.kind === 'grid' && (typeof obj.columns !== 'number' || !Number.isInteger(obj.columns) || obj.columns < 1 || obj.columns > 6)) return null;
    path.add(raw);
    const children: WebElement[] = [];
    for (const child of obj.children) {
      const parsed = read(child, depth + 1, inModal || obj.kind === 'modal');
      if (!parsed) return null;
      children.push(parsed);
    }
    path.delete(raw);
    if (obj.kind === 'section' || obj.kind === 'modal') return { kind: obj.kind, title: obj.title as string, children };
    if (obj.kind === 'grid') return { kind: obj.kind, columns: obj.columns as number, children };
    return { kind: obj.kind, children };
  };
  return read(value, 1);
}

export function buildLayoutElement(kind: LayoutKind, inputs: Record<string, unknown>, config: Record<string, unknown>): WebElement | null {
  const children = inputs.children === undefined ? [] : inputs.children;
  const field = (key: string, fallback: unknown) => inputs[key] !== undefined ? inputs[key] : config[key] !== undefined ? config[key] : fallback;
  return readWebElement({ kind, children,
    ...((kind === 'section' || kind === 'modal') ? { title: field('title', '') } : {}),
    ...(kind === 'grid' ? { columns: field('columns', 2) } : {}),
  });
}
