/**
 * Кастомный узел Canvas: рендерится из Block Definition.
 *
 * - порты (INPUT/OUTPUT) — из дефиниции, с типами и цветами;
 * - визуальный жизненный цикл соединения (0.5.28):
 *   активный исходный порт → совместимые/несовместимые цели →
 *   «готов к подключению» при наведении → короткая вспышка успеха;
 * - подсветка портов, которые требует текущий шаг урока Академии
 *   (шаг «соединить»);
 * - визуальные состояния живого выполнения: RUNNING (неоновый пульс),
 *   SUCCESS (мягкий зелёный), ERROR (красный), SKIPPED (приглушён).
 *   Выполнение и подтверждение соединения — РАЗНЫЕ состояния и
 *   разные сторы (execution-store и connection-fx-store).
 */

import { BlockIcon } from '@/components/BlockIcon';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { blockRegistry } from '@/core/registry/block-registry';
import { portColor, portGlyph } from '@/core/type-system/compatibility';
import type { PortDefinition } from '@/core/types/ports';
import type { CanvasNodeData } from '@/core/project/serialize';
import { useProjectStore } from '@/store/project-store';
import { useExecutionStore } from '@/store/execution-store';
import { useConnectionFxStore } from '@/store/connection-fx-store';
import { useTutorialStore } from '@/store/tutorial-store';
import type { ConnectStep } from '@/academy/types';
import { cn, translateError } from '@/lib/utils';
import {
  getPortVisualState,
  incompatibleTooltip,
  isSourcePortActive,
  type PortVisualState,
} from './port-state';

/** Порт, который подсвечивает текущий шаг Академии «соединить». */
function isAcademyTargetPort(
  step: ConnectStep,
  blockId: string,
  portId: string,
  direction: 'input' | 'output',
): boolean {
  if (direction === 'output') {
    return step.fromBlockId === blockId && (step.fromPortId === undefined || step.fromPortId === portId);
  }
  return step.toBlockId === blockId && (step.toPortId === undefined || step.toPortId === portId);
}

export function NodezzleNode({ id, data, selected }: NodeProps) {
  const { t } = useTranslation();
  const nodeData = data as unknown as CanvasNodeData;
  const def = blockRegistry.get(nodeData.blockId);
  const status = useExecutionStore((s) => s.nodeStates[id]);
  const runInfo = useExecutionStore((s) => s.nodeInfo[id]);
  const dragPort = useProjectStore((s) => s.dragPort);
  // Селекторы возвращают примитивы: узел перерисовывается только когда
  // эффект касается ИМЕННО его (без глобальных перерисовок холста).
  const connectSuccess = useConnectionFxStore(
    (s) => s.success !== null && (s.success.sourceNodeId === id || s.success.targetNodeId === id),
  );
  // Порт, который вспыхивает на этом узле (именно участвовавший в
  // соединении; если ручки не было — подсвечиваем все порты узла).
  const flashPortId = useConnectionFxStore((s) => {
    if (s.success === null) return null;
    if (s.success.sourceNodeId === id) return s.success.sourcePortId ?? 'all';
    if (s.success.targetNodeId === id) return s.success.targetPortId ?? 'all';
    return null;
  });
  const readyPortId = useConnectionFxStore((s) =>
    s.hoverPort !== null && s.hoverPort.nodeId === id ? s.hoverPort.portId : null,
  );
  const academyConnect = useTutorialStore((s) => {
    if (s.lesson === null || !s.active || s.finished) return null;
    const step = s.lesson.steps[s.stepIndex];
    return step !== undefined && step.kind === 'connect' ? step : null;
  });

  // Стикер-заметка (Этап 2, подэтап F): особый рендер, в выполнении не участвует.
  if (nodeData.blockId === 'note.sticky') {
    return (
      <div className={cn('nzz-note', selected && 'selected')}>
        <textarea
          className="nodrag nowheel"
          rows={4}
          placeholder={t('canvas.note.placeholder')}
          value={String(nodeData.config?.text ?? '')}
          onChange={(e) => useProjectStore.getState().setNoteText(id, e.target.value)}
        />
      </div>
    );
  }

  if (!def) {
    return (
      <div className="nodezzle-node status-error p-3 text-xs text-red-300">
        ⚠️ {t('canvas.node.noBlock')}: {nodeData.blockId}
      </div>
    );
  }

  const isDragSource = dragPort !== null && dragPort.nodeId === id;

  /** Всё визуальное состояние одного порта. */
  const portView = (port: PortDefinition, direction: 'input' | 'output') => {
    const state: PortVisualState = getPortVisualState(dragPort, id, port, direction);
    const active = isSourcePortActive(dragPort, id, port.id);
    const ready = readyPortId === port.id;
    const academy = academyConnect !== null
      && isAcademyTargetPort(academyConnect, nodeData.blockId, port.id, direction);
    let tooltip: string | undefined;
    if (state === 'incompatible' && dragPort !== null) {
      const { fromType, toType } = incompatibleTooltip(dragPort, port);
      tooltip = dragPort.kind !== port.kind ? t('canvas.port.kindMismatch') : t('canvas.port.incompatible', {
        from: t(`portTypes.${fromType}`),
        to: t(`portTypes.${toType}`),
      });
    }
    return { state, active, ready, academy, tooltip };
  };

  const handleProps = (port: PortDefinition, direction: 'input' | 'output') => {
    const view = portView(port, direction);
    const candidate = dragPort !== null && !view.active && direction === (dragPort.direction === 'output' ? 'input' : 'output');
    return {
      className: cn(
        'nzz-handle',
        port.kind === 'event' && 'nzz-handle--event',
        port.kind === 'error' && 'nzz-handle--error',
        view.state === 'compatible' && 'port-compatible',
        view.state === 'incompatible' && 'port-incompatible',
        view.active && 'port-active',
        view.ready && 'port-ready',
        view.academy && 'port-academy',
        connectSuccess && (flashPortId === 'all' || flashPortId === port.id) && 'port-connect-success',
      ),
      title: view.tooltip ?? `${t(port.labelKey)} · ${t(`portTypes.${port.type}`)}`,
      'aria-label': `${t(`canvas.design.${direction}`)}: ${t(port.labelKey)} · ${t(`portTypes.${port.type}`)}`,
      'data-port-kind': port.kind,
      'data-port-id': port.id,
      'data-port-direction': direction,
      'data-node-id': id,
      'data-port-active': view.active ? 'true' : undefined,
      'data-port-compatible': candidate
        ? view.state === 'compatible' ? 'true' : 'false'
        : undefined,
      'data-port-ready': view.ready ? 'true' : undefined,
      onPointerEnter: () => {
        if (view.state === 'compatible') {
          useConnectionFxStore.getState().setHoverPort({ nodeId: id, portId: port.id });
        }
      },
      onPointerLeave: () => {
        if (readyPortId === port.id) useConnectionFxStore.getState().clearHoverPort();
      },
    };
  };

  const title = nodeData.label || t(def.labelKey);
  const academyNode = academyConnect !== null
    && (academyConnect.fromBlockId === nodeData.blockId || academyConnect.toBlockId === nodeData.blockId);

  return (
    <div
      className={cn(
        'nodezzle-node',
        selected && 'selected',
        status === 'running' && 'status-running',
        status === 'success' && 'status-success',
        status === 'error' && 'status-error',
        status === 'skipped' && 'status-skipped',
        connectSuccess && 'node-connect-success',
        academyNode && 'node-academy-target',
      )}
      data-testid={`canvas-node-${nodeData.blockId}`}
      data-node-id={id}
      data-connection-state={connectSuccess ? 'connect-success' : isDragSource ? 'drag-source' : undefined}
    >
      {/* Заголовок */}
      <div className="node-heading">
        <span className="node-icon" style={{ color: def.ui?.color }} aria-hidden="true">
          <BlockIcon icon={def.ui?.icon} />
        </span>
        <span className="node-title" title={title}>
          {title}
        </span>
        {def.trigger === true && (
          <span className="node-trigger" title={t('canvas.node.trigger')} aria-label={t('canvas.node.trigger')}>
            ⚡
          </span>
        )}
      </div>

      <div className="node-ports">
        {(['input', 'output'] as const)
          .filter((direction) => (direction === 'input' ? def.inputs : def.outputs).length > 0)
          .map((direction) => (
            <div key={direction} className={cn('min-w-0',
              (direction === 'input' ? def.outputs.length === 0 : def.inputs.length === 0) && 'col-span-2',
            )}>
              {(direction === 'input' ? def.inputs : def.outputs).map((p) => (
                <div key={p.id} className={cn('port-row', `port-row--${direction}`)}>
                  <Handle
                    id={p.id}
                    type={direction === 'input' ? 'target' : 'source'}
                    position={direction === 'input' ? Position.Left : Position.Right}
                    {...handleProps(p, direction)}
                    style={{ ['--port-color' as string]: portColor(p.type) }}
                  />
                  <span className="port-label" title={`${t(p.labelKey)} · ${t(`portTypes.${p.type}`)}`}>
                    {t(p.labelKey)}
                  </span>
                  <span className="port-glyph shrink-0" style={{ color: portColor(p.type) }}
                    title={t(`portTypes.${p.type}`)} aria-label={t(`portTypes.${p.type}`)}>
                    {portGlyph(p.type)}
                  </span>
                </div>
              ))}
            </div>
          ))}
      </div>

      {/* Статус / ошибка выполнения */}
      {(runInfo?.error || status === 'running') && (
        <div
          className={cn(
            'mx-2 mb-2 rounded-lg px-2 py-1 text-[10.5px] leading-snug',
            status === 'error' ? 'bg-red-400/10 text-red-300' : 'bg-cyan-400/10 text-cyan-300',
          )}
        >
          {status === 'error' ? `⛔ ${translateError(runInfo?.error)}` : '⏳ …'}
        </div>
      )}
    </div>
  );
}
