/** 07B3: тип веб-события и неуспех вложенной модели проверяются реальным runtime. */
import { describe, expect, it } from 'vitest';
import { executeCanvas } from './execute';
import { BlockRegistry } from '../registry/block-registry';
import type { CanvasDocument, StoredModel } from '../project/schema';
import { webBlocks } from '@/blocks/web/blocks';
import { coreBlocks } from '@/blocks/core/blocks';
import { modelBlocks } from '@/blocks/models/blocks';
import { dataBlocks } from '@/blocks/data/blocks';

const registry = new BlockRegistry();
for (const block of [...webBlocks, ...coreBlocks, ...modelBlocks, ...dataBlocks]) registry.register(block);
const node = (id: string, blockId: string, config: Record<string, unknown> = {}): CanvasDocument['nodes'][number] =>
  ({ id, blockId, config, position: { x: 0, y: 0 } });
const web: CanvasDocument = { id: 'web', name: 'Веб', nodes: webBlocks.map((b) => node(b.id, b.id)), edges: [] };
const model = (nodes: CanvasDocument['nodes'], edges: CanvasDocument['edges'] = []): StoredModel => ({
  id: 'm', name: 'Модель', version: 1, updatedAt: 1, contract: { inputs: [], outputs: [] },
  canvas: { id: 'inner', name: 'Внутри', nodes, edges },
});
const call: CanvasDocument = { id: 'outer', name: 'Снаружи', nodes: [node('call', 'models.call', { modelId: 'm' })], edges: [] };

describe('Маршрутизация веб-события', () => {
  it.each([['page_load', 'web.page'], ['button_click', 'web.button'], ['form_submit', 'web.form']])('%s запускает только %s', async (event, target) => {
    const payload = { event, values: { name: 'Анна' } };
    const result = await executeCanvas(web, { registry, payload: { source: 'web', web: payload } });
    expect(result.status).toBe('success');
    expect(result.nodeRuns[target].status).toBe('success');
    expect(result.nodeRuns[target].outputs.data).toEqual(target === 'web.form' ? payload.values : payload);
    for (const block of webBlocks.filter((b) => b.id !== target)) {
      expect(result.nodeRuns[block.id]?.outputs?.data).toBeUndefined();
    }
  });

  it('без event сохраняется общий запуск старых схем симулятором', async () => {
    const result = await executeCanvas(web, { registry, payload: { source: 'web', web: { x: 42 } } });
    for (const block of webBlocks) expect(result.nodeRuns[block.id].outputs.data).toEqual({ x: 42 });
  });

  it('неизвестное событие и Telegram не запускают веб-детали', async () => {
    for (const payload of [{ source: 'web' as const, web: { event: 'unknown' } }, { source: 'telegram' as const }]) {
      const result = await executeCanvas(web, { registry, payload });
      expect(result.status).toBe('waiting');
      expect(Object.values(result.nodeRuns).some((n) => n.status === 'success')).toBe(false);
    }
  });
});

describe('Ошибка вложенной модели', () => {
  it('ошибка преобразования внутри не выдаёт успешный result', async () => {
    const inner = model([node('text', 'core.text', { value: 'не число' }), node('convert', 'data.text_to_number')], [
      { id: 'e', source: 'text', sourcePort: 'text', target: 'convert', targetPort: 'value' },
    ]);
    const result = await executeCanvas(call, { registry, models: { m: inner } });
    expect(result.status).toBe('error');
    expect(result.nodeRuns.call.status).toBe('error');
    expect(result.nodeRuns.call.outputs).toEqual({});
    expect(result.logs.some((l) => l.level === 'error')).toBe(true);
  });

  it('ошибка проходит через несколько уровней вызовов', async () => {
    const inner = model([node('nested', 'models.call', { modelId: 'broken' })]);
    const broken = { ...model([]), id: 'broken' };
    const result = await executeCanvas(call, { registry, models: { m: inner, broken } });
    expect(result.nodeRuns.call.status).toBe('error');
    expect(result.nodeRuns.call.outputs).toEqual({});
  });

  it('модель, ожидающая неподходящий триггер, тоже не выдаёт успешный result', async () => {
    const result = await executeCanvas(call, { registry, models: { m: model([node('page', 'web.page')]) } });
    expect(result.status).toBe('error');
    expect(result.nodeRuns.call.error).toBe('ERR_NO_TRIGGER');
  });

  it('успешная модель без внешних выходов по-прежнему возвращает пустой объект', async () => {
    const result = await executeCanvas(call, { registry, models: { m: model([node('text', 'core.text', { value: 'ok' })]) } });
    expect(result.status).toBe('success');
    expect(result.nodeRuns.call.outputs.result).toEqual({});
  });
});
