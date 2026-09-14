/**
 * Формат групп (Этап 2, подэтап F часть 2): опциональность поля
 * `groups` (старые проекты валидны), сериализация и обрезка при
 * извлечении модели.
 */

import { describe, expect, it } from 'vitest';
import { canvasDocumentSchema } from './schema';
import { canvasToFlow, flowToCanvas } from './serialize';

describe('Формат: группы в CanvasDocument', () => {
  it('старый документ без поля groups остаётся валидным', () => {
    const legacy = { id: 'c', name: 'Холст', nodes: [], edges: [] };
    const parsed = canvasDocumentSchema.safeParse(legacy);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.groups).toBeUndefined();
  });

  it('документ с группами проходит валидацию', () => {
    const doc = {
      id: 'c',
      name: 'Холст',
      nodes: [],
      edges: [],
      groups: [{ id: 'g1', label: 'Оплата', nodeIds: ['n1', 'n2'] }],
    };
    const parsed = canvasDocumentSchema.safeParse(doc);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.groups).toHaveLength(1);
      expect(parsed.data.groups![0].nodeIds).toEqual(['n1', 'n2']);
    }
  });

  it('flowToCanvas сохраняет группы; пустые не записывает', () => {
    const { nodes, edges } = canvasToFlow({ id: 'c', name: 'n', nodes: [], edges: [] });
    const withGroups = flowToCanvas(nodes, edges, 'c', 'n', undefined, [
      { id: 'g', nodeIds: ['x'] },
    ]);
    expect(withGroups.groups).toHaveLength(1);

    const noGroups = flowToCanvas(nodes, edges, 'c', 'n');
    expect(noGroups.groups).toBeUndefined();

    const emptyGroups = flowToCanvas(nodes, edges, 'c', 'n', undefined, []);
    expect(emptyGroups.groups).toBeUndefined();
  });
});
