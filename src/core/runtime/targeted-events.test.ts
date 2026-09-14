/** 09A: адрес события независим от подписи узла и проверяется до запуска цепочки. */
import '@/blocks';
import { expect, it } from 'vitest';
import { executeCanvas } from './execute';
import type { CanvasDocument } from '../project/schema';
const node = (id: string, blockId: string) => ({ id, blockId, position: { x: 0, y: 0 }, config: {} });
const doc = (blockId: string): CanvasDocument => ({
  id: 'web', name: 'Веб', nodes: [node('a', blockId), node('b', blockId), node('log-a', 'debug.log'), node('log-b', 'debug.log')],
  edges: ['a', 'b'].map((id) => ({ id, source: id, sourcePort: 'data', target: `log-${id}`, targetPort: 'value' })),
});

it.each([['web.button', 'button_click'], ['web.form', 'form_submit'], ['web.page', 'page_load']])('%s: запускается только адресат и его лог', async (blockId, event) => {
  const web = { event, values: { name: 'Анна', count: 0, active: false } };
  const result = await executeCanvas(doc(blockId), { payload: { source: 'web', targetNodeId: 'b', web } });
  expect(result.status).toBe('success');
  expect(result.nodeRuns.a.status).toBe('skipped');
  expect(result.nodeRuns.b.status).toBe('success');
  expect(result.nodeRuns['log-a']?.status).not.toBe('success');
  expect(result.nodeRuns['log-b'].inputs.value).toEqual(blockId === 'web.form' ? web.values : web);
});

it.each(['missing', '', 'log-a'])('несуществующий адресат или не-триггер %s не включает широковещательный запуск', async (targetNodeId) => {
  const result = await executeCanvas(doc('web.button'), { payload: { source: 'web', targetNodeId, web: { event: 'button_click' } } });
  expect(result.status).toBe('waiting');
  expect(Object.values(result.nodeRuns).some((n) => n.status === 'success')).toBe(false);
});

it('адрес не обходит тип события и источник', async () => {
  for (const payload of [{ source: 'web' as const, web: { event: 'page_load' } }, { source: 'telegram' as const }]) {
    const result = await executeCanvas(doc('web.button'), { payload: { ...payload, targetNodeId: 'b' } });
    expect(result.status).toBe('waiting');
  }
});

it('без адреса старый запуск включает оба подходящих триггера', async () => {
  const result = await executeCanvas(doc('web.button'), { payload: { source: 'web', web: { event: 'button_click' } } });
  expect(result.nodeRuns['log-a'].status).toBe('success');
  expect(result.nodeRuns['log-b'].status).toBe('success');
});

it('адрес в схеме без триггеров не запускает холодные источники', async () => {
  const result = await executeCanvas({ id: 'c', name: 'Холст', nodes: [node('text', 'core.text')], edges: [] }, { payload: { targetNodeId: 'text' } });
  expect(result.status).toBe('waiting');
  expect(Object.values(result.nodeRuns).some((n) => n.status === 'success')).toBe(false);
});
