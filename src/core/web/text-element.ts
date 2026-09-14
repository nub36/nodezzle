/** Инертные данные элемента, не HTML/React и не произвольные DOM-атрибуты. */
export type WebTextElement = { kind: 'text'; text: string } | { kind: 'heading'; text: string; level: number };
export function buildTextElement(kind: 'text' | 'heading', inputs: Record<string, unknown>, config: Record<string, unknown>): WebTextElement | null {
  const text = inputs.text !== undefined ? inputs.text : (config.text !== undefined ? config.text : '');
  if (typeof text !== 'string') return null;
  if (kind === 'text') return { kind, text };
  const level = inputs.level !== undefined ? inputs.level : (config.level !== undefined ? config.level : 2);
  return typeof level === 'number' && Number.isInteger(level) && level >= 1 && level <= 6 ? { kind, text, level } : null;
}
export function readTextElement(value: unknown): WebTextElement | null {
  if (!value || typeof value !== 'object') return null;
  const object = value as Record<string, unknown>;
  if ((object.kind !== 'text' && object.kind !== 'heading') || typeof object.text !== 'string') return null;
  if (object.kind === 'heading' && typeof object.level !== 'number') return null;
  return buildTextElement(object.kind, object, {});
}
