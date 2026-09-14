import { expect, it } from 'vitest';
import { parseWebFormJson } from './web-form-json';
it.each(['', '{oops', '[]', '[1]', 'null', '"строка"', '42', 'false'])('не отправляет некорректные данные формы: %s', (value) => {
  expect(parseWebFormJson(value)).toBeNull();
});
it('сохраняет вложенные значения, null, false и ноль внутри объекта', () => {
  const value = { name: 'Анна', count: 0, enabled: false, nested: { list: [1, null] } };
  expect(parseWebFormJson(JSON.stringify(value))).toEqual(value);
  expect(parseWebFormJson('{}')).toEqual({});
});
