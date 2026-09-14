import { describe, expect, it } from 'vitest';
import { checkCompatibility, portGlyph, isCompatible } from './compatibility';
import { definePort, typeRegistry } from '../types/ports';
import type { PortDefinition } from '../types/ports';

const data = (type: string, id = 'p'): PortDefinition => definePort(id, 'x', 'data', type);
const eventPort = (id = 'e'): PortDefinition => definePort(id, 'x', 'event', 'event');
const errorPort = (id = 'err'): PortDefinition => definePort(id, 'x', 'error', 'error');

describe('checkCompatibility (умные соединения)', () => {
  it('Text → Text разрешён', () => {
    expect(isCompatible(data('text', 'a'), data('text', 'b'))).toBe(true);
  });

  it('Number → Text запрещён (нужен конвертер)', () => {
    expect(isCompatible(data('number', 'a'), data('text', 'b'))).toBe(false);
    expect(checkCompatibility(data('number', 'a'), data('text', 'b')).code).toBe('type-mismatch');
  });

  it('Any совместим со всем', () => {
    expect(isCompatible(data('any', 'a'), data('number', 'b'))).toBe(true);
    expect(isCompatible(data('image', 'a'), data('any', 'b'))).toBe(true);
  });

  it('Image → Telegram Send Photo (тип image) разрешён', () => {
    expect(isCompatible(data('image', 'a'), data('image', 'b'))).toBe(true);
  });

  it('event → event разрешён, event → data запрещён', () => {
    expect(isCompatible(eventPort('a'), eventPort('b'))).toBe(true);
    expect(isCompatible(eventPort('a'), data('any', 'b'))).toBe(false);
    expect(isCompatible(data('any', 'a'), eventPort('b'))).toBe(false);
  });

  it('error → error разрешён, error → data запрещён', () => {
    expect(isCompatible(errorPort('a'), errorPort('b'))).toBe(true);
    expect(isCompatible(errorPort('a'), data('any', 'b'))).toBe(false);
    expect(isCompatible(data('any', 'a'), errorPort('b'))).toBe(false);
  });

  it('пользовательские типы: совместимость из TypeRegistry', () => {
    typeRegistry.register({
      id: 'order_ref',
      labelKey: 'x',
      compatibleWith: ['text', 'any'],
    });
    expect(isCompatible(data('order_ref', 'a'), data('text', 'b'))).toBe(true);
    expect(isCompatible(data('order_ref', 'a'), data('number', 'b'))).toBe(false);
    expect(isCompatible(data('order_ref', 'a'), data('order_ref', 'b'))).toBe(true);
  });
});

describe('portGlyph (визуальный язык типов)', () => {
  it('известным типам назначены глифы', () => {
    expect(portGlyph('text')).toBe('Т');
    expect(portGlyph('number')).toBe('#');
    expect(portGlyph('boolean')).toBe('✓');
    expect(portGlyph('error')).toBe('!');
    expect(portGlyph('event')).toBe('↯');
  });

  it('неизвестный тип получает нейтральный глиф', () => {
    expect(portGlyph('какой_то_новый_тип')).toBe('·');
  });
});
