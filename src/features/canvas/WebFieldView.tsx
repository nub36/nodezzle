import { createContext, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { FIELD_VALUE_LIMIT, type WebFieldElement } from '@/core/web/field-element';

export const WebFieldContext = createContext({ prefix: '', formIds: new Set<string>(), running: false });
export const fieldFormDomId = (prefix: string, id: string) => `${prefix}-form-${encodeURIComponent(id)}`;

export function WebFieldView({ element }: { element: WebFieldElement }) {
  const { t } = useTranslation();
  const { prefix, formIds, running } = useContext(WebFieldContext);
  const bound = formIds.has(element.formNodeId);
  const Tag = element.kind === 'input' ? 'input' : 'textarea';
  return <div data-web-kind={element.kind} className="min-w-0 space-y-1">
    <label className="block text-xs text-muted">
      <span className="mb-1 block whitespace-pre-wrap break-words">{element.label || element.name}</span>
      <Tag className="input-dark w-full min-w-0" {...(element.kind === 'input' ? { type: 'text' } : { rows: 3 })}
        name={element.name} form={bound ? fieldFormDomId(prefix, element.formNodeId) : undefined}
        placeholder={element.placeholder} defaultValue={element.value} maxLength={FIELD_VALUE_LIMIT}
        autoComplete="off" disabled={!bound || running}
      />
    </label>
    {!bound && <p role="status" className="text-xs text-amber-200">{t('execution.panel.web.fieldUnbound')}</p>}
  </div>;
}
