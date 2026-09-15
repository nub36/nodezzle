import '@/blocks';
import { expect, it } from 'vitest';
import { buildFieldElement, readFieldElement, validFieldName, type WebFieldElement } from './field-element';
import { readWebElement } from './layout-element';
import { executeCanvas } from '@/core/runtime/execute';
import { fieldFormPlans, fieldFormValues } from '@/features/canvas/web-field-forms';
const field: WebFieldElement = { kind: 'input', name: 'name', formNodeId: 'form', label: 'Имя', placeholder: 'Введите', value: '' };

it.each(['', '__proto__', 'constructor', 'prototype', 'first.name', 'user[]', 'имя', '1name', 'x'.repeat(65)])('не принимает ключ %s', (name) => {
  expect(validFieldName(name)).toBe(false);
  expect(readFieldElement({ ...field, name })).toBeNull();
});
it('приоритет входов, пустые подписи/значения допустимы, null не fallback', () => {
  expect(buildFieldElement('textarea', { label: '', placeholder: 'Вход' }, { fieldName: 'message', formNodeId: 'form', label: 'Настройка', initialValue: 'x\ny' })).toEqual({ kind: 'textarea', name: 'message', formNodeId: 'form', label: '', placeholder: 'Вход', value: 'x\ny' });
  expect(buildFieldElement('input', { label: null }, { fieldName: 'name' })).toBeNull();
  expect(buildFieldElement('input', {}, { fieldName: 'name' })).toEqual({ ...field, formNodeId: '', label: '', placeholder: '' });
});
it('не принимает превышенные лимиты/типы, удаляет произвольные атрибуты', () => {
  for (const value of [null, 42, {}, 'x'.repeat(4097)]) expect(readFieldElement({ ...field, value })).toBeNull();
  expect(readFieldElement({ ...field, formNodeId: 'x'.repeat(257) })).toBeNull();
  expect(readFieldElement({ ...field, formNodeId: '\nform' })).toBeNull();
  expect(readFieldElement({ ...field, type: 'password', oninput: 'code', required: true })).toEqual(field);
});
it('поля разрешены в дереве, их строки входят в бюджет, невалидный ребёнок отвергает всё дерево', () => {
  const tree = { kind: 'container', children: [field] };
  expect(readWebElement(tree)).toEqual(tree);
  expect(readWebElement({ ...tree, children: [{ ...field, name: '__proto__' }] })).toBeNull();
  expect(readWebElement({ ...tree, children: Array(17).fill({ ...field, value: 'x'.repeat(4096) }) })).toBeNull();
});
it('одинаковые имена допустимы в разных формах, повтор внутри формы блокируется', () => {
  const items = [{ element: field }, { element: { ...field, formNodeId: 'other' } }];
  expect(fieldFormPlans(items, ['form', 'other']).get('form')?.error).toBeNull();
  expect(fieldFormPlans(items, ['form', 'other']).get('other')?.error).toBeNull();
  expect(fieldFormPlans([...items, { element: field }], ['form', 'other']).get('form')?.error).toBe('duplicate');
});
it('неактуальные/ошибочные корни и циклы не допускают частичную отправку, пустые/слишком большие формы блокируются', () => {
  expect(fieldFormPlans([{ element: field }, { element: null }], ['form']).get('form')?.error).toBe('unready');
  expect(fieldFormPlans([{ element: field }], ['form'], true).get('form')?.error).toBe('unready');
  expect(fieldFormPlans([], ['form']).get('form')?.error).toBe('empty');
  expect(fieldFormPlans(Array.from({ length: 65 }, (_, i) => ({ element: { ...field, name: `n${i}` } })), ['form']).get('form')?.error).toBe('limit');
});
it('вложенные повторения одного поля тоже считаются дубликатами', () => {
  expect(fieldFormPlans([{ element: { kind: 'grid', columns: 2, children: [field, field] } }], ['form']).get('form')?.error).toBe('duplicate');
});
it('submit сохраняет строки, пустые значения и Unicode без смешивания с JSON', () => {
  const fields = [field, { ...field, name: 'message', kind: 'textarea' as const }];
  expect(fieldFormValues(fields, [['name', ''], ['message', 'Первая\nВторая 🌿']])).toEqual({ name: '', message: 'Первая\nВторая 🌿' });
});
it.each([[['name', 'a'], ['name', 'b']], [], [['other', 'x']], [['name', {}]], [['name', 'x'.repeat(4097)]]].map((entries) => ({ entries })))('повторно проверяет DOM-данные $entries', ({ entries }) => {
  expect(fieldFormValues([field], entries as Array<[string, unknown]>)).toBeNull();
});
it('runtime выдаёт дескриптор с входной подписью; форма отдаёт только переданные значения', async () => {
  const fieldResult = await executeCanvas({ id: 'c', name: 'Холст', nodes: [
    { id: 's', blockId: 'core.text', config: { value: 'Подпись из схемы' }, position: { x: 0, y: 0 } },
    { id: 'i', blockId: 'web.input', config: { fieldName: 'name', formNodeId: 'form' }, position: { x: 0, y: 0 } },
  ], edges: [{ id: 'e', source: 's', sourcePort: 'text', target: 'i', targetPort: 'label' }] });
  expect(fieldResult.status).toBe('success');
  expect(fieldResult.nodeRuns.i.outputs.element).toMatchObject({ ...field, label: 'Подпись из схемы', placeholder: '' });
  const result = await executeCanvas({ id: 'c', name: 'Холст', nodes: [
    { id: 'form', blockId: 'web.form', config: { formMode: 'fields' }, position: { x: 0, y: 0 } },
  ], edges: [] }, { payload: { source: 'web', targetNodeId: 'form', web: { event: 'form_submit', values: { name: 'Анна' } } } });
  expect(result.nodeRuns.form.outputs.data).toEqual({ name: 'Анна' });
});
