/** Инертное описание текстового поля. Введённые данные не принадлежат runtime. */
export type WebFieldElement = ({ kind: 'input' } | { kind: 'textarea' }) & {
  name: string; formNodeId: string;
  label: string; placeholder: string; value: string;
};
export const FIELD_VALUE_LIMIT = 4096;
export const validFieldName = (value: unknown): value is string => typeof value === 'string'
  && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value) && !['constructor', 'prototype'].includes(value);
export const isWebField = (id: string) => id === 'web.input' || id === 'web.textarea';

export function readFieldElement(raw: unknown): WebFieldElement | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.kind !== 'input' && o.kind !== 'textarea') return null;
  if (!validFieldName(o.name) || typeof o.formNodeId !== 'string' || o.formNodeId.length > 256 || /[\u0000-\u001f\u007f]/u.test(o.formNodeId)) return null;
  if (![o.label, o.placeholder, o.value].every((v) => typeof v === 'string' && v.length <= FIELD_VALUE_LIMIT)) return null;
  return { kind: o.kind, name: o.name, formNodeId: o.formNodeId, label: o.label as string, placeholder: o.placeholder as string, value: o.value as string };
}
export function buildFieldElement(kind: WebFieldElement['kind'], inputs: Record<string, unknown>, config: Record<string, unknown>): WebFieldElement | null {
  const setting = (key: string) => config[key] === undefined ? '' : config[key];
  return readFieldElement({ kind, name: setting('fieldName'), formNodeId: setting('formNodeId'),
    label: inputs.label === undefined ? setting('label') : inputs.label,
    placeholder: inputs.placeholder === undefined ? setting('placeholder') : inputs.placeholder,
    value: setting('initialValue'),
  });
}
