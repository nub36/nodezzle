/**
 * Серверная валидация схемы перед публикацией (подэтап 5.6).
 *
 * Сервер не доверяет фронтенду: публикация (неизменяемая LIVE-версия)
 * создаётся только для документа, прошедшего все проверки здесь.
 * Реестр блоков общий с клиентом (`@/blocks`) — один источник правды.
 */

import { blockRegistry } from '@/blocks';
import { effectiveStatus } from '@/core/registry/block-registry';
import type { NodezzleProject, CanvasNode } from '@/core/project/schema';

const MAX_MODEL_DEPTH = 5;

export interface ValidationIssue {
  /** Стабильный машинный код проблемы. */
  code: string;
  nodeId?: string;
  edgeId?: string;
  message: string;
}

export function validateForPublish(project: NodezzleProject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { nodes, edges } = project.canvas;

  if (nodes.length === 0) {
    issues.push({ code: 'EMPTY_CANVAS', message: 'Схема пуста — публиковать нечего' });
    return issues;
  }

  const byId = new Map<string, CanvasNode>();
  for (const node of nodes) {
    if (byId.has(node.id)) {
      issues.push({ code: 'DUPLICATE_NODE', nodeId: node.id, message: `Дублирующийся узел «${node.id}»` });
      continue;
    }
    byId.set(node.id, node);
  }

  const modelIds = new Set(project.models.map((m) => m.id));
  if (modelIds.size !== project.models.length) {
    issues.push({ code: 'DUPLICATE_MODEL', message: 'Идентификаторы моделей должны быть уникальными' });
  }

  // Узлы: существование блока, реализованность, привязка моделей.
  for (const node of byId.values()) {
    const def = blockRegistry.get(node.blockId);
    if (!def) {
      issues.push({
        code: 'MISSING_BLOCK',
        nodeId: node.id,
        message: `Блок «${node.blockId}» отсутствует в реестре`,
      });
      continue;
    }
    if (effectiveStatus(def) === 'planned') {
      issues.push({
        code: 'BLOCK_NOT_IMPLEMENTED',
        nodeId: node.id,
        message: `Блок «${def.labelKey ?? node.blockId}» ещё не реализован и не может публиковаться`,
      });
    }
    const modelId = node.config.modelId;
    if (typeof modelId === 'string' && modelId !== '' && !modelIds.has(modelId)) {
      issues.push({
        code: 'UNKNOWN_MODEL',
        nodeId: node.id,
        message: `Узел ссылается на несуществующую модель «${modelId}»`,
      });
    }
  }

  // Рёбра: концы и порты должны существовать в определениях.
  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source) {
      issues.push({ code: 'EDGE_SOURCE_NODE', edgeId: edge.id, message: `Ребро «${edge.id}» исходит из несуществующего узла` });
      continue;
    }
    if (!target) {
      issues.push({ code: 'EDGE_TARGET_NODE', edgeId: edge.id, message: `Ребро «${edge.id}» входит в несуществующий узел` });
      continue;
    }
    const sourceDef = blockRegistry.get(source.blockId);
    const targetDef = blockRegistry.get(target.blockId);
    if (sourceDef && !sourceDef.outputs.some((p) => p.id === edge.sourcePort)) {
      issues.push({
        code: 'EDGE_UNKNOWN_SOURCE_PORT',
        edgeId: edge.id,
        message: `У узла «${source.blockId}» нет выходного порта «${edge.sourcePort}»`,
      });
    }
    if (targetDef && !targetDef.inputs.some((p) => p.id === edge.targetPort)) {
      issues.push({
        code: 'EDGE_UNKNOWN_TARGET_PORT',
        edgeId: edge.id,
        message: `У узла «${target.blockId}» нет входного порта «${edge.targetPort}»`,
      });
    }
  }

  // Обязательные входы должны получать хотя бы одно входящее ребро.
  const incoming = new Set<string>();
  for (const edge of edges) incoming.add(`${edge.target}:${edge.targetPort}`);
  for (const node of byId.values()) {
    const def = blockRegistry.get(node.blockId);
    if (!def) continue;
    for (const port of def.inputs) {
      if (port.required && !incoming.has(`${node.id}:${port.id}`)) {
        issues.push({
          code: 'REQUIRED_INPUT_EMPTY',
          nodeId: node.id,
          message: `Обязательный вход «${port.id}» узла «${node.blockId}» не подключён`,
        });
      }
    }
  }

  // Рекурсия: схема обязана быть ациклическим графом.
  if (hasCycle(nodes, edges)) {
    issues.push({ code: 'CYCLE', message: 'В схеме обнаружен цикл — исполнение зациклится' });
  }

  // Глубина вложенности моделей («модель вызывает модель») — статически.
  issues.push(...checkModelDepth(project));

  // Точка входа: хотя бы один узел без входящих рёбер.
  const targets = new Set(edges.map((e) => e.target));
  if (!nodes.some((n) => !targets.has(n.id))) {
    issues.push({ code: 'NO_ENTRY_POINT', message: 'В схеме нет стартовой точки (узла без входящих рёбер)' });
  }

  return issues;
}

function hasCycle(nodes: CanvasNode[], edges: Array<{ source: string; target: string }>): boolean {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges) {
    if (adjacency.has(edge.source) && adjacency.has(edge.target)) {
      adjacency.get(edge.source)!.push(edge.target);
    }
  }
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string): boolean => {
    const mark = state.get(id);
    if (mark === 'visiting') return true;
    if (mark === 'done') return false;
    state.set(id, 'visiting');
    for (const next of adjacency.get(id) ?? []) {
      if (visit(next)) return true;
    }
    state.set(id, 'done');
    return false;
  };
  for (const node of nodes) {
    if (visit(node.id)) return true;
  }
  return false;
}


/** Глубина цепочки вызовов моделей; циклический вызов — тоже ошибка. */
function checkModelDepth(project: NodezzleProject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const calls = new Map<string, Set<string>>();
  for (const model of project.models) {
    const targets = new Set<string>();
    for (const node of model.canvas.nodes) {
      const modelId = node.config.modelId;
      if (node.blockId === 'models.call' && typeof modelId === 'string' && modelId !== '') {
        targets.add(modelId);
      }
    }
    calls.set(model.id, targets);
  }

  const depthOf = (id: string, chain: Set<string>): number => {
    if (chain.has(id)) return Number.POSITIVE_INFINITY; // цикл
    const next = calls.get(id);
    if (!next || next.size === 0) return 1;
    let max = 1;
    for (const child of next) {
      max = Math.max(max, 1 + depthOf(child, new Set([...chain, id])));
    }
    return max;
  };

  for (const model of project.models) {
    const depth = depthOf(model.id, new Set());
    if (!Number.isFinite(depth)) {
      issues.push({ code: 'MODEL_CYCLE', message: `Модель «${model.name}» участвует в цикле вызовов моделей` });
    } else if (depth > MAX_MODEL_DEPTH) {
      issues.push({
        code: 'MODEL_DEPTH_EXCEEDED',
        message: `Вложенность моделей «${model.name}» равна ${depth} (максимум ${MAX_MODEL_DEPTH})`,
      });
    }
  }
  return issues;
}
