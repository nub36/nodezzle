import { describe, expect, it } from 'vitest';
import { nodezzleProjectSchema, tryParseProject, type NodezzleProject } from './schema';

const validProject: NodezzleProject = {
  formatVersion: 1,
  id: 'p1',
  name: 'Тест',
  kind: 'telegram',
  canvas: {
    id: 'c1',
    name: 'Схема',
    nodes: [
      { id: 'n1', blockId: 'telegram.message_received', position: { x: 0, y: 0 }, config: {} },
      {
        id: 'n2',
        blockId: 'telegram.send_message',
        position: { x: 300, y: 0 },
        config: { note: 'x' },
        label: 'Отправка',
      },
    ],
    edges: [
      { id: 'e1', source: 'n1', sourcePort: 'text', target: 'n2', targetPort: 'text' },
    ],
  },
  models: [
    {
      id: 'm1',
      name: 'Order Model',
      version: 1,
      contract: {
        inputs: [
          { id: 'user_id', name: 'Пользователь', type: 'number', required: true },
          { id: 'product_id', name: 'Товар', type: 'number' },
          { id: 'quantity', name: 'Количество', type: 'number' },
        ],
        outputs: [
          { id: 'order_id', name: 'Заказ', type: 'number' },
          { id: 'price', name: 'Цена', type: 'number' },
          { id: 'status', name: 'Статус', type: 'text' },
        ],
        error: { id: 'error_message', name: 'Ошибка', type: 'text' },
      },
      canvas: {
        id: 'mc1',
        name: 'Внутри',
        nodes: [{ id: 'mn1', blockId: 'core.input', position: { x: 0, y: 0 }, config: { portId: 'user_id' } }],
        edges: [],
      },
      updatedAt: 1,
    },
  ],
  variables: [{ id: 'v1', name: 'greeting', type: 'text', value: 'Привет', scope: 'project' }],
  meta: { createdAt: 1, updatedAt: 2 },
};

describe('Project Format (formatVersion 1)', () => {
  it('валидный проект проходит валидацию', () => {
    const result = nodezzleProjectSchema.safeParse(validProject);
    expect(result.success).toBe(true);
  });

  it('отклоняет неверную formatVersion', () => {
    const bad = { ...validProject, formatVersion: 2 } as unknown as NodezzleProject;
    expect(nodezzleProjectSchema.safeParse(bad).success).toBe(false);
  });

  it('отклоняет проект без схемы', () => {
    const { canvas, ...rest } = validProject;
    void canvas;
    expect(nodezzleProjectSchema.safeParse(rest).success).toBe(false);
  });

  it('отклоняет edge без targetPort', () => {
    const bad = structuredClone(validProject);
    delete (bad.canvas.edges[0] as { targetPort?: string }).targetPort;
    expect(nodezzleProjectSchema.safeParse(bad).success).toBe(false);
  });

  it('tryParseProject возвращает null для мусора', () => {
    expect(tryParseProject({ hello: 'world' })).toBeNull();
    expect(tryParseProject(null)).toBeNull();
    expect(tryParseProject(validProject)?.id).toBe('p1');
  });

  it('контракт модели: inputs/outputs обязательны', () => {
    const bad = structuredClone(validProject);
    delete (bad.models[0].contract as { inputs?: unknown }).inputs;
    expect(nodezzleProjectSchema.safeParse(bad).success).toBe(false);
  });
});
