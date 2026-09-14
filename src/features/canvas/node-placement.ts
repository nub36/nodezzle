/** Поиск свободной позиции новой детали. Все величины — в координатах холста. */
import type { NodezzleFlowNode } from '@/core/project/serialize';
import type { BlockDefinition } from '@/core/types/blocks';

export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export interface Rect extends Point, Size {}
export const INSERT_GAP = 24;

/** Консервативный размер до первого измерения React Flow; соответствует компактной раскладке. */
export function estimateNodeSize(def: BlockDefinition | undefined): Size {
  if (def?.id === 'note.sticky') return { width: 210, height: 90 };
  return { width: 240, height: 56 + 24 * Math.max(def?.inputs.length ?? 0, def?.outputs.length ?? 0, 1) };
}

export function occupiedRects(nodes: NodezzleFlowNode[], getBlock: (id: string) => BlockDefinition | undefined): Rect[] {
  return nodes.map((node) => {
    const fallback = estimateNodeSize(getBlock(node.data.blockId));
    const positive = (n: number | undefined, otherwise: number) => n !== undefined && Number.isFinite(n) && n > 0 ? n : otherwise;
    return {
      ...node.position,
      width: positive(node.measured?.width, positive(node.width, fallback.width)),
      height: positive(node.measured?.height, positive(node.height, fallback.height)),
    };
  });
}

export function fitsIn(position: Point, size: Size, bounds: Rect): boolean {
  return position.x >= bounds.x && position.y >= bounds.y &&
    position.x + size.width <= bounds.x + bounds.width + 1e-6 &&
    position.y + size.height <= bounds.y + bounds.height + 1e-6;
}

/**
 * Ближайшая свободная точка в видимой области: проверяем горизонтальные полосы
 * у границ препятствий и проекцию желаемой позиции. В полосе объединяем занятые
 * интервалы X. Целые позиции соответствуют округлению при сохранении v1.
 * Не перебираем пиксели и не меняем существующие прямоугольники.
 * Если область заполнена, гарантированно свободное место — справа от схемы.
 */
export function findFreePosition(preferred: Point, size: Size, obstacles: Rect[], bounds: Rect, gap = INSERT_GAP): Point {
  const minX = Math.ceil(bounds.x);
  const maxX = Math.floor(bounds.x + bounds.width - size.width);
  const minY = Math.ceil(bounds.y);
  const maxY = Math.floor(bounds.y + bounds.height - size.height);
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
  if (maxX >= minX && maxY >= minY) {
    const nearby = obstacles.filter((r) => r.x + r.width + gap > bounds.x && r.x - gap < bounds.x + bounds.width &&
      r.y + r.height + gap > bounds.y && r.y - gap < bounds.y + bounds.height);
    const rows = new Set([clamp(Math.round(preferred.y), minY, maxY), minY, maxY]);
    for (const r of nearby) {
      rows.add(clamp(Math.floor(r.y - size.height - gap), minY, maxY));
      rows.add(clamp(Math.ceil(r.y + r.height + gap), minY, maxY));
    }
    let best: Point | undefined;
    let distance = Infinity;
    const consider = (start: number, end: number, y: number) => {
      start = Math.ceil(start);
      end = Math.floor(end);
      if (start > end) return;
      const x = clamp(Math.round(preferred.x), start, end);
      const d = (x - preferred.x) ** 2 + (y - preferred.y) ** 2;
      if (d < distance) { best = { x, y }; distance = d; }
    };
    for (const y of rows) {
      const blocked = nearby.filter((r) => y < r.y + r.height + gap - 1e-6 && y + size.height + gap > r.y + 1e-6)
        .map((r) => ({ start: r.x - size.width - gap, end: r.x + r.width + gap }))
        .sort((a, b) => a.start - b.start);
      let cursor = minX;
      for (const interval of blocked) {
        if (interval.end <= cursor) continue;
        if (interval.start >= cursor) consider(cursor, Math.min(maxX, interval.start), y);
        cursor = Math.max(cursor, interval.end);
        if (cursor > maxX) break;
      }
      consider(cursor, maxX, y);
    }
    if (best) return best;
  }
  return { x: Math.ceil(obstacles.reduce((right, r) => Math.max(right, r.x + r.width + gap), preferred.x)), y: Math.round(preferred.y) };
}
