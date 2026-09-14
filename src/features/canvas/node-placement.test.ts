/** Геометрия вставки: без DOM, без перестановки старых узлов. */
import { describe, expect, it } from 'vitest';
import { estimateNodeSize, occupiedRects, findFreePosition, fitsIn, INSERT_GAP, type Rect } from './node-placement';
import { blockRegistry } from '@/core/registry/block-registry';
import '@/blocks';

const size = { width: 240, height: 100 };
const bounds = { x: 0, y: 0, width: 900, height: 600 };
const collision = (a: Rect, b: Rect, gap = INSERT_GAP) =>
  a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
  a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;

describe('Свободная позиция детали', () => {
  it('свободная точка сохраняется, позиция за экраном ограничивается видимой областью', () => {
    expect(findFreePosition({ x: 120, y: 90 }, size, [], bounds)).toEqual({ x: 120, y: 90 });
    expect(findFreePosition({ x: -100, y: 900 }, size, [], bounds)).toEqual({ x: 0, y: 500 });
  });

  it('занятое место обходится с зазором, препятствие не изменяется', () => {
    const block = Object.freeze({ x: 300, y: 200, ...size });
    const point = findFreePosition(block, size, [block], bounds);
    expect(fitsIn(point, size, bounds)).toBe(true);
    expect(collision({ ...point, ...size }, block)).toBe(false);
    expect(point).toEqual({ x: 300, y: 76 });
  });

  it('учитывается высота многопортовой детали, не только ширина', () => {
    const tall = { x: 300, y: 0, width: 240, height: 500 };
    const point = findFreePosition({ x: 300, y: 200 }, size, [tall], bounds);
    expect(fitsIn(point, size, bounds)).toBe(true);
    expect(collision({ ...point, ...size }, tall)).toBe(false);
  });

  it('узкое свободное окно находится между препятствиями вне регулярной сетки', () => {
    const obstacles = [{ x: 0, y: 0, width: 147, height: 600 }, { x: 435, y: 0, width: 465, height: 600 }];
    const point = findFreePosition({ x: 300, y: 123 }, size, obstacles, bounds);
    expect(point).toEqual({ x: 171, y: 123 });
  });

  it('препятствие за видимой границей тоже учитывается, если касается новой детали', () => {
    const obstacle = { x: -200, y: 0, width: 240, height: 600 };
    const point = findFreePosition({ x: 0, y: 100 }, size, [obstacle], bounds);
    expect(point.x).toBe(64);
  });

  it('заполненный или слишком маленький экран даёт свободную позицию справа от всей схемы', () => {
    const obstacles = [{ ...bounds }, { x: 2000, y: 0, ...size }];
    for (const view of [bounds, { ...bounds, width: 100 }]) {
      const point = findFreePosition({ x: 300, y: 200 }, size, obstacles, view);
      expect(point.x).toBe(2264);
      expect(obstacles.some((o) => collision({ ...point, ...size }, o))).toBe(false);
    }
  });

  it('дробный viewport и размеры дают целую сохраняемую позицию без потери зазора', () => {
    const obstacle = { x: 123.5, y: 45.75, width: 240, height: 82.5 };
    const point = findFreePosition(obstacle, size, [obstacle], { x: 0.5, y: 0.5, width: 900, height: 600 });
    expect(Number.isInteger(point.x) && Number.isInteger(point.y)).toBe(true);
    expect(collision({ ...point, ...size }, obstacle)).toBe(false);
  });

  it('серия быстрых вставок разных размеров не пересекается и детерминирована', () => {
    const build = () => {
      const result: Rect[] = [];
      for (let i = 0; i < 80; i++) {
        const nextSize = { width: 240, height: 80 + i % 7 * 24 };
        const position = findFreePosition({ x: 330, y: 200 }, nextSize, result, bounds);
        const next = { ...position, ...nextSize };
        expect(result.some((r) => collision(next, r))).toBe(false);
        result.push(next);
      }
      return result;
    };
    expect(build()).toEqual(build());
  });

  it('дальние узлы большого холста не меняют выбор в свободном viewport', () => {
    const obstacles = Array.from({ length: 1000 }, (_, i) => ({ x: 5000 + i * 300, y: 5000, ...size }));
    expect(findFreePosition({ x: 100, y: 100 }, size, obstacles, bounds)).toEqual({ x: 100, y: 100 });
  });
});

describe('Размеры до и после измерения React Flow', () => {
  it('высота зависит от большей колонки портов, стикеры имеют отдельную оценку', () => {
    const def = blockRegistry.get('telegram.message_received')!;
    expect(estimateNodeSize(def)).toEqual({ width: 240, height: 56 + 24 * Math.max(def.inputs.length, def.outputs.length) });
    expect(estimateNodeSize(blockRegistry.get('note.sticky'))).toEqual({ width: 210, height: 90 });
  });

  it('измеренные размеры важнее оценки; до измерения и при нулевых размерах используется оценка', () => {
    const node = { id: 'a', type: 'nodezzle' as const, position: { x: 15, y: 30 }, data: { blockId: 'core.text', config: {} } };
    const getBlock = (id: string) => blockRegistry.get(id);
    expect(occupiedRects([node], getBlock)[0]).toEqual({ x: 15, y: 30, width: 240, height: 80 });
    expect(occupiedRects([{ ...node, measured: { width: 300, height: 180 } }], getBlock)[0].height).toBe(180);
    expect(occupiedRects([{ ...node, measured: { width: 0, height: NaN } }], getBlock)[0].height).toBe(80);
  });
});
