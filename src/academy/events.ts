/**
 * Tutorial Completion Bridge (QA-аудит Академии).
 *
 * Единый нормализованный контракт событий обучения. События НЕ являются
 * вторым рантаймом: они выводятся дифом двух снимков состояния
 * (единственный источник истины — сторы продукта) и нужны для:
 *  - диагностирования «почему шаг не засчитался»;
 *  - журнала последних действий в режиме диагностики;
 *  - единой терминологии интеграционных и E2E-проверок.
 */

import type { DebugPanelTab } from '@/lib/debug-tabs';
import type { AcademySnapshot } from './types';

export type TutorialEventType =
  | 'BLOCK_ADDED'
  | 'BLOCK_SELECTED'
  | 'CONNECTION_CREATED'
  | 'BLOCK_CONFIG_CHANGED'
  | 'EXECUTION_FINISHED'
  | 'SIMULATOR_MESSAGE_SENT'
  | 'MODEL_CREATED'
  | 'DEBUG_OPENED'
  | 'DEBUG_CLOSED'
  | 'DEBUG_TAB_CHANGED'
  | 'PAGE_OPENED';

export interface TutorialEvent {
  type: TutorialEventType;
  at: number;
  /** Детали события — достаточно для проверки конкретного действия. */
  data: {
    nodeId?: string;
    blockType?: string;
    sourceNodeId?: string;
    sourceBlockType?: string;
    sourcePort?: string;
    targetNodeId?: string;
    targetBlockType?: string;
    targetPort?: string;
    status?: string;
    source?: string;
    text?: string;
    route?: string;
    tab?: DebugPanelTab;
  };
  /** Шаг, текущий на момент события (диагностика сопоставления). */
  stepId?: string;
}

function blockTypeOf(snapshot: AcademySnapshot, nodeId: string): string | undefined {
  return snapshot.nodes.find((n) => n.id === nodeId)?.blockId;
}

/**
 * Нормализованные события между двумя снимками. Вызывается наблюдателем
 * при каждом изменении состояния продукта.
 */
export function diffSnapshots(
  prev: AcademySnapshot | null,
  next: AcademySnapshot,
  now: number = Date.now(),
): TutorialEvent[] {
  const events: TutorialEvent[] = [];
  const push = (type: TutorialEventType, data: TutorialEvent['data']) =>
    events.push({ type, at: now, data });

  if (prev === null) return events;

  // Детали на холсте.
  const prevNodeIds = new Set(prev.nodes.map((n) => n.id));
  for (const node of next.nodes) {
    if (!prevNodeIds.has(node.id)) {
      push('BLOCK_ADDED', { nodeId: node.id, blockType: node.blockId });
      if (node.blockId === 'models.call') {
        push('MODEL_CREATED', { nodeId: node.id, blockType: node.blockId });
      }
    }
  }

  // Выделение: в снимке — ТИП выбранной детали (и экземпляр, если есть).
  if (next.selectedBlockId !== prev.selectedBlockId && next.selectedBlockId != null) {
    push('BLOCK_SELECTED', {
      nodeId: next.selectedNodeId ?? undefined,
      blockType: next.selectedBlockId,
    });
  }

  // Соединения.
  const edgeKey = (e: { sourceNodeId: string; targetNodeId: string; sourcePortId?: string; targetPortId?: string }) =>
    `${e.sourceNodeId}|${e.sourcePortId ?? ''}|${e.targetNodeId}|${e.targetPortId ?? ''}`;
  const prevEdges = new Set(prev.edges.map(edgeKey));
  for (const edge of next.edges) {
    if (!prevEdges.has(edgeKey(edge))) {
      push('CONNECTION_CREATED', {
        sourceNodeId: edge.sourceNodeId,
        sourceBlockType: blockTypeOf(next, edge.sourceNodeId),
        sourcePort: edge.sourcePortId,
        targetNodeId: edge.targetNodeId,
        targetBlockType: blockTypeOf(next, edge.targetNodeId),
        targetPort: edge.targetPortId,
      });
    }
  }

  // Настройки деталей.
  const prevById = new Map(prev.nodes.map((n) => [n.id, n]));
  for (const node of next.nodes) {
    const before = prevById.get(node.id);
    if (before !== undefined && JSON.stringify(before.config ?? {}) !== JSON.stringify(node.config ?? {})) {
      push('BLOCK_CONFIG_CHANGED', { nodeId: node.id, blockType: node.blockId });
    }
  }

  // Запуск схемы.
  const prevRun = prev.lastRun ?? null;
  const nextRun = next.lastRun ?? null;
  if (nextRun !== null && (prevRun === null || nextRun.at !== prevRun.at)) {
    push('EXECUTION_FINISHED', { status: nextRun.status, source: nextRun.source });
    if (nextRun.source !== undefined && next.simulatorText !== undefined) {
      push('SIMULATOR_MESSAGE_SENT', { source: nextRun.source, text: next.simulatorText });
    }
  }

  // Панель отладки: событие — только реальный переход (оба значения известны).
  if (typeof prev.debugOpen === 'boolean' && prev.debugOpen !== next.debugOpen) {
    push(next.debugOpen === true ? 'DEBUG_OPENED' : 'DEBUG_CLOSED', {});
  }

  if (next.debugOpen === true && next.debugTab !== undefined && prev.debugTab !== next.debugTab) {
    push('DEBUG_TAB_CHANGED', { tab: next.debugTab });
  }

  // Маршрут.
  if (prev.route !== next.route && next.route !== undefined && next.route !== '') {
    push('PAGE_OPENED', { route: next.route });
  }

  return events;
}

/** Человекочитаемое описание события (режим диагностики, разработка). */
export function describeEvent(e: TutorialEvent): string {
  const d = e.data;
  switch (e.type) {
    case 'BLOCK_ADDED':
      return `BLOCK_ADDED ${d.blockType ?? '?'}`;
    case 'BLOCK_SELECTED':
      return `BLOCK_SELECTED ${d.blockType ?? '?'}`;
    case 'CONNECTION_CREATED':
      return `CONNECTION_CREATED ${d.sourceBlockType ?? '?'}(${d.sourcePort ?? '·'}) → ${d.targetBlockType ?? '?'}(${d.targetPort ?? '·'})`;
    case 'BLOCK_CONFIG_CHANGED':
      return `BLOCK_CONFIG_CHANGED ${d.blockType ?? '?'}`;
    case 'EXECUTION_FINISHED':
      return `EXECUTION_FINISHED ${d.status ?? '?'}${d.source !== undefined ? ` (${d.source})` : ''}`;
    case 'SIMULATOR_MESSAGE_SENT':
      return `SIMULATOR_MESSAGE_SENT ${d.source ?? '?'}`;
    case 'MODEL_CREATED':
      return 'MODEL_CREATED';
    case 'DEBUG_OPENED':
      return 'DEBUG_OPENED';
    case 'DEBUG_CLOSED':
      return 'DEBUG_CLOSED';
    case 'DEBUG_TAB_CHANGED':
      return `DEBUG_TAB_CHANGED ${d.tab ?? '?'}`;
    case 'PAGE_OPENED':
      return `PAGE_OPENED ${d.route ?? ''}`;
    default:
      return e.type;
  }
}
