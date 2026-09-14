/**
 * Адаптер: собирает снимок состояния продукта из живых сторов
 * для чистой проверки шагов урока (подэтап 5.11).
 */

import type { AcademySnapshot } from '@/academy/types';
import { blockRegistry } from '@/core/registry/block-registry';
import { useExecutionStore } from '@/store/execution-store';
import { useProjectStore } from '@/store/project-store';
import { useTutorialStore } from '@/store/tutorial-store';

/**
 * Фактический источник запуска: если на холсте триггеры только одного
 * направления, рантайм использует его независимо от настроек симулятора
 * (та же логика, что в `buildTriggerPayload`).
 */
export function effectiveRunSource(
  payloadSource: 'telegram' | 'web',
  nodes: Array<{ blockId: string }>,
): 'telegram' | 'web' {
  const categories = nodes.map((n) => blockRegistry.get(n.blockId)?.category);
  const hasTelegram = categories.some((c) => typeof c === 'string' && c.startsWith('telegram'));
  const hasWeb = categories.some((c) => typeof c === 'string' && c.startsWith('web'));
  if (hasTelegram && !hasWeb) return 'telegram';
  if (hasWeb && !hasTelegram) return 'web';
  return payloadSource;
}

export function buildAcademySnapshot(): AcademySnapshot {
  const project = useProjectStore.getState();
  const execution = useExecutionStore.getState();
  const tutorial = useTutorialStore.getState();

  const lastRecord = execution.history[0];

  return {
    nodes: project.nodes.map((n) => ({
      id: n.id,
      blockId: n.data.blockId,
      config: n.data.config,
    })),
    edges: project.edges.map((e) => ({
      sourceNodeId: e.source,
      sourcePortId: e.sourceHandle ?? undefined,
      targetNodeId: e.target,
      targetPortId: e.targetHandle ?? undefined,
    })),
    selectedBlockId:
      project.selectedNodeId !== null
        ? project.nodes.find((n) => n.id === project.selectedNodeId)?.data.blockId ?? null
        : null,
    selectedNodeId: project.selectedNodeId,
    modelIds: project.project?.models.map((model) => model.id) ?? [],
    lastRun:
      lastRecord !== undefined
        ? {
          status: lastRecord.status,
          at: lastRecord.at,
          source: lastRecord.source ?? tutorial.lastRunSource ?? undefined,
          results: !execution.running && execution.nodeInfoRunId === lastRecord.id
            ? project.nodes.flatMap((node) => {
                const info = execution.nodeInfo[node.id];
                return info ? [{ nodeId: node.id, blockId: node.data.blockId, status: info.status, outputs: info.outputs }] : [];
              })
            : undefined,
        }
        : null,
    outboxCount: execution.outbox.length,
    debugOpen: tutorial.debugOpen,
    debugTab: execution.panelTab,
    route: typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '',
    simulatorText: lastRecord?.simulatorText ?? tutorial.lastSimulatorText ?? undefined,
  };
}
