/** Безопасный переносимый контракт дерева. Не содержит DOM, ссылок на узлы или HTML. */
import { readUrlElement, type WebUrlElement } from './url-element';
import { readTextElement, type WebTextElement } from './text-element';

export type LayoutKind = 'container' | 'section' | 'grid';
export type WebElement = WebTextElement | WebUrlElement
  | { kind: 'container'; children: WebElement[] }
  | { kind: 'section'; title: string; children: WebElement[] }
  | { kind: 'grid'; columns: number; children: WebElement[] };

export const WEB_TREE_LIMITS = { depth: 16, nodes: 256, text: 65536 } as const;

/** Возвращает новую очищенную копию или null. Никаких частично принятых деревьев. */
export function readWebElement(value: unknown): WebElement | null {
  let remaining = WEB_TREE_LIMITS.nodes as number;
  let textBudget = WEB_TREE_LIMITS.text as number;
  const path = new Set<object>();
  const read = (raw: unknown, depth: number): WebElement | null => {
    if (depth > WEB_TREE_LIMITS.depth || --remaining < 0 || !raw || typeof raw !== 'object' || Array.isArray(raw) || path.has(raw)) return null;
    const obj = raw as Record<string, unknown>;
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
    if (obj.kind !== 'container' && obj.kind !== 'section' && obj.kind !== 'grid') return null;
    if (!Array.isArray(obj.children) || obj.children.length > remaining) return null;
    if (obj.kind === 'section' && (typeof obj.title !== 'string' || (textBudget -= obj.title.length) < 0)) return null;
    if (obj.kind === 'grid' && (typeof obj.columns !== 'number' || !Number.isInteger(obj.columns) || obj.columns < 1 || obj.columns > 6)) return null;
    path.add(raw);
    const children: WebElement[] = [];
    for (const child of obj.children) {
      const parsed = read(child, depth + 1);
      if (!parsed) return null;
      children.push(parsed);
    }
    path.delete(raw);
    if (obj.kind === 'section') return { kind: obj.kind, title: obj.title as string, children };
    if (obj.kind === 'grid') return { kind: obj.kind, columns: obj.columns as number, children };
    return { kind: obj.kind, children };
  };
  return read(value, 1);
}

export function buildLayoutElement(kind: LayoutKind, inputs: Record<string, unknown>, config: Record<string, unknown>): WebElement | null {
  const children = inputs.children === undefined ? [] : inputs.children;
  const field = (key: string, fallback: unknown) => inputs[key] !== undefined ? inputs[key] : config[key] !== undefined ? config[key] : fallback;
  return readWebElement({ kind, children,
    ...(kind === 'section' ? { title: field('title', '') } : {}),
    ...(kind === 'grid' ? { columns: field('columns', 2) } : {}),
  });
}
