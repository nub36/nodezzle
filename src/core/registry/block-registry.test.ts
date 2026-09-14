import { describe, expect, it } from 'vitest';
import { BlockRegistry } from './block-registry';
import type { BlockDefinition } from '../types/blocks';

function makeDef(id: string, overrides: Partial<BlockDefinition> = {}): BlockDefinition {
  return {
    id,
    labelKey: `blocks.${id}.label`,
    category: 'core',
    inputs: [],
    outputs: [],
    ...overrides,
  };
}

describe('BlockRegistry', () => {
  it('регистрирует и возвращает блоки', () => {
    const reg = new BlockRegistry();
    reg.register(makeDef('core.test'));
    expect(reg.get('core.test')).toBeDefined();
    expect(reg.has('core.test')).toBe(true);
    expect(reg.list()).toHaveLength(1);
  });

  it('бросает ошибку на дубликат id', () => {
    const reg = new BlockRegistry();
    reg.register(makeDef('core.dup'));
    expect(() => reg.register(makeDef('core.dup'))).toThrow(/уже зарегистрирован/);
  });

  it('отклоняет некорректный id (без категории)', () => {
    const reg = new BlockRegistry();
    expect(() => reg.register(makeDef('without-dot'))).toThrow(/Некорректный id/);
  });

  it('фильтрует доступные блоки и категории', () => {
    const reg = new BlockRegistry();
    reg.register(makeDef('telegram.msg', { category: 'telegram_actions', trigger: true }));
    reg.register(makeDef('memory.var', { category: 'memory', available: false }));
    reg.register(makeDef('core.x', { category: 'core' }));
    expect(reg.available()).toHaveLength(2);
    expect(reg.byCategory('telegram_actions')).toHaveLength(1);
    expect(reg.triggers()).toHaveLength(1);
  });

  it('отклоняет дублирующиеся порты в пределах направления', () => {
    const reg = new BlockRegistry();
    expect(() =>
      reg.register({
        id: 'core.dupport',
        labelKey: 'x',
        category: 'core',
        inputs: [
          { id: 'a', labelKey: 'x', kind: 'data', type: 'text' },
          { id: 'a', labelKey: 'x', kind: 'data', type: 'text' },
        ],
        outputs: [],
      }),
    ).toThrow(/Дублирующийся порт/);
  });

  it('разрешает одинаковый id у INPUT и OUTPUT (pass-through)', () => {
    const reg = new BlockRegistry();
    reg.register({
      id: 'core.passthrough',
      labelKey: 'x',
      category: 'core',
      inputs: [{ id: 'value', labelKey: 'x', kind: 'data', type: 'any' }],
      outputs: [{ id: 'value', labelKey: 'x', kind: 'data', type: 'any' }],
    });
    expect(reg.get('core.passthrough')).toBeDefined();
  });
});
