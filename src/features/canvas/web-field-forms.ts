import type { WebElement } from '@/core/web/layout-element';
import { FIELD_VALUE_LIMIT, validFieldName, type WebFieldElement } from '@/core/web/field-element';

export type FieldFormPlan = { fields: WebFieldElement[]; error: 'unready' | 'empty' | 'duplicate' | 'limit' | null };
export function fieldFormPlans(items: Array<{ element: WebElement | null }>, ids: string[], hasCycle = false): Map<string, FieldFormPlan> {
  const plans = new Map<string, FieldFormPlan>(ids.map((id) => [id, { fields: [], error: null }]));
  const visit = (element: WebElement) => {
    if (element.kind === 'input' || element.kind === 'textarea') plans.get(element.formNodeId)?.fields.push(element);
    if ('children' in element) element.children.forEach(visit);
  };
  for (const item of items) if (item.element) visit(item.element);
  for (const plan of plans.values()) {
    if (hasCycle || items.some((item) => !item.element)) plan.error = 'unready';
    else if (!plan.fields.length) plan.error = 'empty';
    else if (plan.fields.length > 64) plan.error = 'limit';
    else if (new Set(plan.fields.map((f) => f.name)).size !== plan.fields.length) plan.error = 'duplicate';
  }
  return plans;
}
/** Повторная проверка DOM FormData: ни дубликатов, ни неожиданных/пропущенных полей/файлов. */
export function fieldFormValues(fields: WebFieldElement[], entries: Iterable<[string, unknown]>): Record<string, string> | null {
  if (!fields.length || fields.length > 64) return null;
  const expected = new Set(fields.map((f) => f.name));
  if (expected.size !== fields.length || ![...expected].every(validFieldName)) return null;
  const values: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const [name, value] of entries) {
    if (!expected.has(name) || seen.has(name) || typeof value !== 'string' || value.length > FIELD_VALUE_LIMIT) return null;
    seen.add(name); values.push([name, value]);
  }
  return seen.size === expected.size ? Object.fromEntries(values) : null;
}
