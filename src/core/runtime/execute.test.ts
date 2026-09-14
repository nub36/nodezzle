import { describe, expect, it } from 'vitest';
import { executeCanvas, sleepWithCancel } from './execute';
import { BlockRegistry } from '../registry/block-registry';
import { coreBlocks } from '@/blocks/core/blocks';
import { dataBlocks } from '@/blocks/data/blocks';
import { logicBlocks } from '@/blocks/logic/blocks';
import { flowBlocks } from '@/blocks/flow/blocks';
import { telegramBlocks } from '@/blocks/telegram/blocks';
import { modelBlocks } from '@/blocks/models/blocks';
import { debugBlocks } from '@/blocks/debug/blocks';
import { createDemoProject } from '@/demo/seed';
import type { CanvasDocument, NodezzleProject, StoredModel } from '../project/schema';

function buildRegistry(): BlockRegistry {
  const reg = new BlockRegistry();
  for (const def of [...coreBlocks, ...dataBlocks, ...logicBlocks, ...flowBlocks, ...telegramBlocks, ...modelBlocks, ...debugBlocks]) {
    reg.register(def);
  }
  return reg;
}

const modelsOf = (project: NodezzleProject): Record<string, StoredModel> =>
  Object.fromEntries(project.models.map((m) => [m.id, m]));

const TG = (text: string, chatId = 1000, userId = 42) => ({
  source: 'telegram' as const,
  telegram: { text, chat_id: chatId, user_id: userId },
});

describe('executeCanvas: живое выполнение схем', () => {
  it('демо-проект: Telegram → модель → Telegram (успех, outbox)', async () => {
    const project = createDemoProject();
    const result = await executeCanvas(project.canvas, {
      registry: buildRegistry(),
      payload: TG('привет'),
      models: modelsOf(project),
    });

    expect(result.status).toBe('success');
    expect(result.outbox).toHaveLength(1);
    expect(result.outbox[0].text).toBe('Привет! Это NODEZZLE 🤖');
    expect(result.outbox[0].chatId).toBe(1000);
    // Все узлы основной схемы выполнены успешно.
    for (const n of project.canvas.nodes) {
      expect(result.nodeRuns[n.id].status).toBe('success');
    }
  }, 10000);

  it('ветвление: «пока» → ответ-подсказка', async () => {
    const project = createDemoProject();
    const result = await executeCanvas(project.canvas, {
      registry: buildRegistry(),
      payload: TG('пока'),
      models: modelsOf(project),
    });
    expect(result.status).toBe('success');
    expect(result.outbox[0].text).toBe('Напишите «привет», чтобы начать 👋');
  });

  it('конвертеры: Text → Number → Text', async () => {
    const doc: CanvasDocument = {
      id: 'c',
      name: 't',
      nodes: [
        { id: 't', blockId: 'core.text', position: { x: 0, y: 0 }, config: { value: '42' } },
        { id: 'c1', blockId: 'data.text_to_number', position: { x: 200, y: 0 }, config: {} },
        { id: 'c2', blockId: 'data.number_to_text', position: { x: 400, y: 0 }, config: {} },
        { id: 'o', blockId: 'core.output', position: { x: 600, y: 0 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 't', sourcePort: 'text', target: 'c1', targetPort: 'value' },
        { id: 'e2', source: 'c1', sourcePort: 'value', target: 'c2', targetPort: 'value' },
        { id: 'e3', source: 'c2', sourcePort: 'value', target: 'o', targetPort: 'value' },
      ],
    };
    const result = await executeCanvas(doc, {
      registry: buildRegistry(),
      payload: { source: 'generic' },
    });
    // core.output — entry-блок модели, в обычной схеме запускается без payload.
    expect(result.nodeRuns['c1'].outputs.value).toBe(42);
    expect(result.nodeRuns['c2'].outputs.value).toBe('42');
    expect(result.nodeRuns['c1'].status).toBe('success');
  });

  it('ошибка конвертера: блок ERROR, данные не распространяются', async () => {
    const doc: CanvasDocument = {
      id: 'c',
      name: 't',
      nodes: [
        { id: 't', blockId: 'core.text', position: { x: 0, y: 0 }, config: { value: 'abc' } },
        { id: 'c1', blockId: 'data.text_to_number', position: { x: 200, y: 0 }, config: {} },
        { id: 'c2', blockId: 'data.number_to_text', position: { x: 400, y: 0 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 't', sourcePort: 'text', target: 'c1', targetPort: 'value' },
        { id: 'e2', source: 'c1', sourcePort: 'value', target: 'c2', targetPort: 'value' },
      ],
    };
    const result = await executeCanvas(doc, { registry: buildRegistry(), payload: { source: 'generic' } });
    expect(result.status).toBe('error');
    expect(result.nodeRuns['c1'].status).toBe('error');
    expect(result.nodeRuns['c1'].error).toBe('ERR_INVALID_NUMBER');
    // c2 не запускался вообще (в nodeRuns его нет).
    expect(result.nodeRuns['c2']?.status ?? 'idle').toBe('idle');
  });

  it('триггер «Команда» срабатывает только на свою команду', async () => {
    const doc: CanvasDocument = {
      id: 'c',
      name: 't',
      nodes: [
        { id: 'cmd', blockId: 'telegram.command', position: { x: 0, y: 0 }, config: { command: '/start' } },
        { id: 'txt', blockId: 'core.text', position: { x: 200, y: 0 }, config: { value: 'OK' } },
        { id: 'send', blockId: 'telegram.send_message', position: { x: 400, y: 0 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'txt', sourcePort: 'text', target: 'send', targetPort: 'text' },
        { id: 'e2', source: 'cmd', sourcePort: 'chat_id', target: 'send', targetPort: 'chat_id' },
      ],
    };
    const reg = buildRegistry();

    const fired = await executeCanvas(doc, {
      registry: reg,
      payload: { source: 'telegram', telegram: { text: '/start', chat_id: 7, user_id: 1, command: '/start' } },
    });
    expect(fired.nodeRuns['cmd'].status).toBe('success');
    expect(fired.outbox).toHaveLength(1);

    const skipped = await executeCanvas(doc, {
      registry: reg,
      payload: { source: 'telegram', telegram: { text: '/other', chat_id: 7, user_id: 1, command: '/other' } },
    });
    expect(skipped.nodeRuns['cmd'].status).toBe('skipped');
    expect(skipped.status).toBe('waiting');
  });

  it('debug.log записывает значение в журнал', async () => {
    const doc: CanvasDocument = {
      id: 'c',
      name: 't',
      nodes: [
        { id: 't', blockId: 'core.text', position: { x: 0, y: 0 }, config: { value: 'hello' } },
        { id: 'log', blockId: 'debug.log', position: { x: 200, y: 0 }, config: { label: 'Test' } },
      ],
      edges: [{ id: 'e1', source: 't', sourcePort: 'text', target: 'log', targetPort: 'value' }],
    };
    const logs: string[] = [];
    const result = await executeCanvas(doc, {
      registry: buildRegistry(),
      payload: { source: 'generic' },
      onLog: (e) => logs.push(e.message),
    });
    expect(result.nodeRuns['log'].outputs.value).toBe('hello');
    expect(logs).toContain('Test');
  });

  it('обнаруживает цикл (защита бюджета шагов)', async () => {
    const doc: CanvasDocument = {
      id: 'c',
      name: 't',
      nodes: [
        { id: 'a', blockId: 'debug.log', position: { x: 0, y: 0 }, config: {} },
        { id: 'b', blockId: 'debug.log', position: { x: 200, y: 0 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'a', sourcePort: 'value', target: 'b', targetPort: 'value' },
        { id: 'e2', source: 'b', sourcePort: 'value', target: 'a', targetPort: 'value' },
      ],
    };
    const result = await executeCanvas(doc, { registry: buildRegistry(), payload: { source: 'generic' } });
    expect(result.status).toBe('error');
    expect(result.error).toBe('ERR_CYCLE');
  });

  it('Задержка: ожидает и пропускает значение', async () => {
    const doc: CanvasDocument = {
      id: 'c',
      name: 't',
      nodes: [
        { id: 't', blockId: 'core.text', position: { x: 0, y: 0 }, config: { value: 'x' } },
        { id: 'd', blockId: 'flow.delay', position: { x: 200, y: 0 }, config: { delayMs: 40 } },
      ],
      edges: [{ id: 'e1', source: 't', sourcePort: 'text', target: 'd', targetPort: 'value' }],
    };
    const t0 = Date.now();
    const result = await executeCanvas(doc, { registry: buildRegistry(), payload: { source: 'generic' } });
    expect(result.nodeRuns['d'].outputs.value).toBe('x');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(30);
  });

  it('отмена (STOPPED) во время задержки', async () => {
    const doc: CanvasDocument = {
      id: 'c',
      name: 't',
      nodes: [{ id: 'd', blockId: 'flow.delay', position: { x: 0, y: 0 }, config: { delayMs: 500 } }],
      edges: [],
    };
    const cancel = { cancelled: false };
    setTimeout(() => {
      cancel.cancelled = true;
    }, 50);
    const result = await executeCanvas(doc, { registry: buildRegistry(), payload: { source: 'generic' }, cancel });
    expect(result.status).toBe('stopped');
  });

  it('модель внутри модели: рекурсивное выполнение', async () => {
    // Внешняя модель содержит вызов внутренней модели.
    const inner: StoredModel = {
      id: 'inner',
      name: 'Inner',
      version: 1,
      contract: {
        inputs: [{ id: 'in', name: 'Вход', type: 'text' }],
        outputs: [{ id: 'out', name: 'Выход', type: 'text' }],
      },
      canvas: {
        id: 'ic',
        name: 'inner',
        nodes: [
          { id: 'ii', blockId: 'core.input', position: { x: 0, y: 0 }, config: { portId: 'in' } },
          { id: 'tc', blockId: 'logic.condition', position: { x: 200, y: 0 }, config: { operator: 'contains', target: 'hi', trueValue: 'HI!', falseValue: 'NO' } },
          { id: 'io', blockId: 'core.output', position: { x: 420, y: 0 }, config: { portId: 'out' } },
        ],
        edges: [
          { id: 'ie1', source: 'ii', sourcePort: 'value', target: 'tc', targetPort: 'value' },
          { id: 'ie2', source: 'tc', sourcePort: 'true', target: 'io', targetPort: 'value' },
          { id: 'ie3', source: 'tc', sourcePort: 'false', target: 'io', targetPort: 'value' },
        ],
      },
      updatedAt: 1,
    };
    const outer: StoredModel = {
      id: 'outer',
      name: 'Outer',
      version: 1,
      contract: {
        inputs: [{ id: 'q', name: 'Запрос', type: 'text' }],
        outputs: [{ id: 'r', name: 'Результат', type: 'text' }],
      },
      canvas: {
        id: 'oc',
        name: 'outer',
        nodes: [
          { id: 'oi', blockId: 'core.input', position: { x: 0, y: 0 }, config: { portId: 'q' } },
          { id: 'ob', blockId: 'data.to_object', position: { x: 200, y: 0 }, config: { key: 'in' } },
          { id: 'ocall', blockId: 'models.call', position: { x: 400, y: 0 }, config: { modelId: 'inner' } },
          { id: 'of', blockId: 'data.from_object', position: { x: 600, y: 0 }, config: { key: 'out' } },
          { id: 'oo', blockId: 'core.output', position: { x: 800, y: 0 }, config: { portId: 'r' } },
        ],
        edges: [
          { id: 'oe1', source: 'oi', sourcePort: 'value', target: 'ob', targetPort: 'value' },
          { id: 'oe2', source: 'ob', sourcePort: 'payload', target: 'ocall', targetPort: 'payload' },
          { id: 'oe3', source: 'ocall', sourcePort: 'result', target: 'of', targetPort: 'payload' },
          { id: 'oe4', source: 'of', sourcePort: 'value', target: 'oo', targetPort: 'value' },
        ],
      },
      updatedAt: 1,
    };

    const models = { inner, outer };
    const reg = buildRegistry();

    // Полный путь: executeCanvas(outer) → models.call → executeModel(inner) → executeCanvas(inner).
    const captured: Record<string, unknown> = {};
    const result = await executeCanvas(outer.canvas, {
      registry: reg,
      models,
      payload: { source: 'model', model: { inputs: { q: 'hi there' } } },
      contextOverrides: { modelOutputs: captured },
    });
    expect(result.status).toBe('success');
    expect(captured.r).toBe('HI!');
  }, 15000);

  it('sleepWithCancel: бросает ERR_CANCELLED при отмене', async () => {
    const cancel = { cancelled: false };
    setTimeout(() => {
      cancel.cancelled = true;
    }, 10);
    await expect(sleepWithCancel(300, cancel)).rejects.toThrow('ERR_CANCELLED');
  });
});
