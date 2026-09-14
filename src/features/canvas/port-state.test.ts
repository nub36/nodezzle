/**
 * Тесты визуального состояния портов при перетаскивании соединения
 * («умные соединения», 0.5.28). Чистая логика — без React и DOM.
 */

import { describe, expect, it } from 'vitest';
import type { PortDefinition } from '@/core/types/ports';
import type { DragPortInfo } from '@/store/project-store';
import {
  getPortVisualState,
  incompatibleTooltip,
  isSourcePortActive,
} from './port-state';

const textInput: PortDefinition = { id: 'value', labelKey: 'x', kind: 'data', type: 'text' };
const numberInput: PortDefinition = { id: 'value', labelKey: 'x', kind: 'data', type: 'number' };
const eventInput: PortDefinition = { id: 'trigger', labelKey: 'x', kind: 'event', type: 'any' };

const textOutputDrag: DragPortInfo = {
  nodeId: 'src',
  portId: 'text',
  direction: 'output',
  kind: 'data',
  type: 'text',
};

describe('Состояние портов при перетаскивании соединения', () => {
  it('нет перетаскивания — все порты нейтральны', () => {
    expect(getPortVisualState(null, 'a', textInput, 'input')).toBe('neutral');
    expect(getPortVisualState(null, 'a', textInput, 'output')).toBe('neutral');
  });

  it('connection start: тянем OUTPUT(text) — совместимый INPUT совместим', () => {
    expect(getPortVisualState(textOutputDrag, 'other', textInput, 'input')).toBe('compatible');
  });

  it('incompatible target: text → number несовместим и помечен', () => {
    expect(getPortVisualState(textOutputDrag, 'other', numberInput, 'input')).toBe('incompatible');
  });

  it('порты другого направления и выходы не оцениваются', () => {
    expect(getPortVisualState(textOutputDrag, 'other', textInput, 'output')).toBe('neutral');
  });

  it('порты исходного узла остаются нейтральными (источник — состояние active)', () => {
    expect(getPortVisualState(textOutputDrag, 'src', textInput, 'input')).toBe('neutral');
    expect(isSourcePortActive(textOutputDrag, 'src', 'text')).toBe(true);
    expect(isSourcePortActive(textOutputDrag, 'src', 'value')).toBe(false);
    expect(isSourcePortActive(textOutputDrag, 'other', 'text')).toBe(false);
    expect(isSourcePortActive(null, 'src', 'text')).toBe(false);
  });

  it('перетаскивание из INPUT оценивает выходы', () => {
    const drag: DragPortInfo = { nodeId: 'tgt', portId: 'value', direction: 'input', kind: 'data', type: 'text' };
    const textOut: PortDefinition = { id: 'text', labelKey: 'x', kind: 'data', type: 'text' };
    expect(getPortVisualState(drag, 'src', textOut, 'output')).toBe('compatible');
    const numberOut: PortDefinition = { id: 'value', labelKey: 'x', kind: 'data', type: 'number' };
    expect(getPortVisualState(drag, 'src', numberOut, 'output')).toBe('incompatible');
    expect(getPortVisualState(drag, 'src', textOut, 'input')).toBe('neutral');
  });

  it('событийные порты несовместимы с данными', () => {
    expect(getPortVisualState(textOutputDrag, 'other', eventInput, 'input')).toBe('incompatible');
  });

  it('тултип несовместимости показывает пару типов в верном направлении', () => {
    expect(incompatibleTooltip(textOutputDrag, numberInput)).toEqual({
      fromType: 'text',
      toType: 'number',
    });
    const inputDrag: DragPortInfo = { nodeId: 't', portId: 'value', direction: 'input', kind: 'data', type: 'number' };
    const textOut: PortDefinition = { id: 'text', labelKey: 'x', kind: 'data', type: 'text' };
    expect(incompatibleTooltip(inputDrag, textOut)).toEqual({ fromType: 'text', toType: 'number' });
  });
});
