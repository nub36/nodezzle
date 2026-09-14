/**
 * Создание модели из выделенных деталей (Этап 2, подэтап G).
 *
 * Чистая функция уровня формата проекта: берёт CanvasDocument и список
 * выделенных узлов, строит StoredModel (контракт + внутренняя схема) и новый
 * внешний холст, где выделенный фрагмент заменён деталью «Вызов модели».
 *
 * Граничные связи увязываются конвертерами (как в демо-проекте):
 *   внешний источник → «В объект» (ключ = вход контракта) → вход «Вызов модели»;
 *   выход «Вызов модели» → «Из объекта» (ключ = выход контракта) → внешний получатель;
 *   ошибки наружу — напрямую через error-порт «Вызов модели».
 *
 * Ограничение этапа (честно): поддерживается не более ОДНОГО внешнего входа
 * (у «Вызов модели» один объектный вход `вход`); многопортовые контракты
 * появятся вместе с динамическими портами. Событийные связи через границу
 * не поддерживаются.
 */

import type { CanvasDocument, CanvasEdge, CanvasNode, ModelContract, StoredModel } from '../project/schema';
import type { PortDefinition } from '../types/ports';
import { uid } from '../../lib/id';

export interface BlockPortsInfo {
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  trigger?: boolean;
}

export interface ExtractModelOptions {
  canvas: CanvasDocument;
  selectedNodeIds: string[];
  modelName: string;
  /** Сведения о портах блока (обычно — реестр блоков). */
  getBlock: (blockId: string) => BlockPortsInfo | undefined;
  /** Человекочитаемое имя порта (русское), с фолбэком на технический идентификатор. */
  portName: (labelKey: string, fallback: string) => string;
}

export type ExtractModelError =
  | 'ERR_MODEL_EXTRACT_EMPTY'
  | 'ERR_MODEL_EXTRACT_TRIGGER'
  | 'ERR_MODEL_EXTRACT_MANY_INPUTS'
  | 'ERR_MODEL_EXTRACT_UNSUPPORTED_PORT';

export interface ExtractModelSuccess {
  model: StoredModel;
  /** Новый холст того же уровня (внешняя схема после замены фрагмента). */
  canvas: CanvasDocument;
  /** Идентификатор вставленного узла «Вызов модели» (для выделения в UI). */
  callNodeId: string;
}

export type ExtractModelResult = { ok: true; value: ExtractModelSuccess } | { ok: false; error: ExtractModelError };

const fail = (error: ExtractModelError): ExtractModelResult => ({ ok: false, error });

/** Технический идентификатор порта контракта (безопасный для формата). */
function contractId(raw: string, used: Set<string>): string {
  let id = raw.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  if (id === '') id = 'port';
  let candidate = id;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${id}_${n}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

export function extractModel(options: ExtractModelOptions): ExtractModelResult {
  const { canvas, getBlock, portName } = options;
  const modelName = options.modelName.trim() === '' ? 'Модель' : options.modelName.trim();

  const nodeById = new Map(canvas.nodes.map((n) => [n.id, n]));
  // Заметки в модель не переносим — они остаются на внешнем холсте.
  const selected = new Set(
    [...new Set(options.selectedNodeIds)].filter((id) => {
      const node = nodeById.get(id);
      return node !== undefined && node.blockId !== 'note.sticky';
    }),
  );

  if (selected.size < 2) return fail('ERR_MODEL_EXTRACT_EMPTY');
  for (const id of selected) {
    const def = getBlock(nodeById.get(id)!.blockId);
    if (def?.trigger === true) return fail('ERR_MODEL_EXTRACT_TRIGGER');
  }

  const portOf = (nodeId: string, portId: string, direction: 'inputs' | 'outputs') => {
    const def = getBlock(nodeById.get(nodeId)!.blockId);
    return def?.[direction].find((p) => p.id === portId);
  };

  // --- Граничные связи ---
  const inEdges = canvas.edges.filter((e) => selected.has(e.target) && !selected.has(e.source));
  const outEdges = canvas.edges.filter((e) => selected.has(e.source) && !selected.has(e.target));

  for (const e of inEdges) {
    const port = portOf(e.source, e.sourcePort, 'outputs');
    if (!port || port.kind !== 'data') return fail('ERR_MODEL_EXTRACT_UNSUPPORTED_PORT');
  }
  for (const e of outEdges) {
    const port = portOf(e.source, e.sourcePort, 'outputs');
    if (!port || port.kind === 'event') return fail('ERR_MODEL_EXTRACT_UNSUPPORTED_PORT');
  }
  if (inEdges.length > 1) return fail('ERR_MODEL_EXTRACT_MANY_INPUTS');

  // --- Контракт ---
  const usedIds = new Set<string>();
  const contract: ModelContract = { inputs: [], outputs: [] };

  let inputEdge: CanvasEdge | undefined;
  if (inEdges.length === 1) {
    inputEdge = inEdges[0];
    const targetPort = portOf(inputEdge.target, inputEdge.targetPort, 'inputs');
    const id = contractId(inputEdge.targetPort, usedIds);
    contract.inputs.push({
      id,
      name: targetPort ? portName(targetPort.labelKey, inputEdge.targetPort) : inputEdge.targetPort,
      type: targetPort?.type ?? 'any',
      required: true,
    });
  }

  // Выходы: уникальные внутренние порты, из которых идут связи наружу (кроме ошибок).
  interface OutputGroup {
    portId: string;
    sourceNodeId: string;
    sourcePortId: string;
    type: string;
    edges: CanvasEdge[];
  }
  const outputGroups: OutputGroup[] = [];
  const errorOutEdges: CanvasEdge[] = [];
  for (const e of outEdges) {
    const port = portOf(e.source, e.sourcePort, 'outputs');
    if (port?.kind === 'error') {
      errorOutEdges.push(e);
      continue;
    }
    const key = `${e.source}:${e.sourcePort}`;
    let group = outputGroups.find((g) => `${g.sourceNodeId}:${g.sourcePortId}` === key);
    if (!group) {
      group = {
        portId: contractId(e.sourcePort, usedIds),
        sourceNodeId: e.source,
        sourcePortId: e.sourcePort,
        type: port?.type ?? 'any',
        edges: [],
      };
      outputGroups.push(group);
    }
    group.edges.push(e);
  }
  for (const g of outputGroups) {
    const port = portOf(g.sourceNodeId, g.sourcePortId, 'outputs');
    contract.outputs.push({
      id: g.portId,
      name: port ? portName(port.labelKey, g.sourcePortId) : g.sourcePortId,
      type: g.type,
    });
  }
  if (errorOutEdges.length > 0) {
    contract.error = { id: 'error', name: 'Ошибка', type: 'error' };
  }

  // --- Внутренняя схема модели ---
  const innerNodes = canvas.nodes.filter((n) => selected.has(n.id));
  const minX = Math.min(...innerNodes.map((n) => n.position.x));
  const minY = Math.min(...innerNodes.map((n) => n.position.y));
  const maxX = Math.max(...innerNodes.map((n) => n.position.x));

  const modelNodes: CanvasNode[] = innerNodes.map((n) => ({
    ...n,
    position: { x: n.position.x - minX + 160, y: n.position.y - minY + 60 },
  }));
  const modelEdges: CanvasEdge[] = canvas.edges.filter(
    (e) => selected.has(e.source) && selected.has(e.target),
  );

  if (inputEdge) {
    const targetNode = nodeById.get(inputEdge.target)!;
    const inputNodeId = uid();
    const inputId = contract.inputs[0].id;
    modelNodes.push({
      id: inputNodeId,
      blockId: 'core.input',
      position: { x: 20, y: targetNode.position.y - minY + 60 },
      config: { portId: inputId },
    });
    modelEdges.push({
      id: uid(),
      source: inputNodeId,
      sourcePort: 'value',
      target: inputEdge.target,
      targetPort: inputEdge.targetPort,
    });
  }

  for (const g of outputGroups) {
    const sourceNode = nodeById.get(g.sourceNodeId)!;
    const outputNodeId = uid();
    modelNodes.push({
      id: outputNodeId,
      blockId: 'core.output',
      position: { x: maxX - minX + 320, y: sourceNode.position.y - minY + 60 },
      config: { portId: g.portId },
    });
    modelEdges.push({
      id: uid(),
      source: g.sourceNodeId,
      sourcePort: g.sourcePortId,
      target: outputNodeId,
      targetPort: 'value',
    });
  }

  const now = Date.now();
  const model: StoredModel = {
    id: uid(),
    name: modelName,
    version: 1,
    contract,
    canvas: { id: uid(), name: modelName, nodes: modelNodes, edges: modelEdges },
    updatedAt: now,
  };

  // --- Внешний холст ---
  const keptNodes = canvas.nodes.filter((n) => !selected.has(n.id));
  const centroidX = innerNodes.reduce((sum, n) => sum + n.position.x, 0) / innerNodes.length;
  const centroidY = innerNodes.reduce((sum, n) => sum + n.position.y, 0) / innerNodes.length;

  const callNodeId = uid();
  const outerNodes: CanvasNode[] = [
    ...keptNodes,
    { id: callNodeId, blockId: 'models.call', position: { x: centroidX, y: centroidY }, config: { modelId: model.id } },
  ];
  const outerEdges: CanvasEdge[] = canvas.edges.filter(
    (e) => !selected.has(e.source) && !selected.has(e.target),
  );

  if (inputEdge) {
    const toObjectId = uid();
    outerNodes.push({
      id: toObjectId,
      blockId: 'data.to_object',
      position: { x: centroidX - 280, y: centroidY },
      config: { key: contract.inputs[0].id },
    });
    outerEdges.push({
      id: uid(),
      source: inputEdge.source,
      sourcePort: inputEdge.sourcePort,
      target: toObjectId,
      targetPort: 'value',
    });
    outerEdges.push({
      id: uid(),
      source: toObjectId,
      sourcePort: 'payload',
      target: callNodeId,
      targetPort: 'payload',
    });
  }

  outputGroups.forEach((g, index) => {
    const fromObjectId = uid();
    outerNodes.push({
      id: fromObjectId,
      blockId: 'data.from_object',
      position: { x: centroidX + 280, y: centroidY + index * 90 },
      config: { key: g.portId },
    });
    outerEdges.push({
      id: uid(),
      source: callNodeId,
      sourcePort: 'result',
      target: fromObjectId,
      targetPort: 'payload',
    });
    for (const e of g.edges) {
      outerEdges.push({
        id: uid(),
        source: fromObjectId,
        sourcePort: 'value',
        target: e.target,
        targetPort: e.targetPort,
      });
    }
  });

  for (const e of errorOutEdges) {
    outerEdges.push({
      id: uid(),
      source: callNodeId,
      sourcePort: 'error',
      target: e.target,
      targetPort: e.targetPort,
    });
  }

  return {
    ok: true,
    value: {
      model,
      canvas: { ...canvas, nodes: outerNodes, edges: outerEdges },
      callNodeId,
    },
  };
}
