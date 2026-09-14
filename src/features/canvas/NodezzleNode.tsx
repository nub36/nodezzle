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
      tooltip = t('canvas.port.incompatible', {
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
        connectSuccess && 'port-connect-success',
      ),
      title: view.tooltip,
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
      <div className="flex items-center gap-2 border-b border-line/70 px-3 py-2.5">
        <span className="text-sm" aria-hidden="true">
          {def.ui?.icon ?? '🧩'}
        </span>
        <span className="flex-1 truncate text-[12.5px] font-semibold leading-tight" title={title}>
          {title}
        </span>
        {def.trigger === true && (
          <span className="rounded-full bg-fuchsia-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-fuchsia-300">
            {t('canvas.node.trigger')}
          </span>
        )}
      </div>

      <div className="px-2 py-1.5">
        {/* Входы (INPUT) */}
        {def.inputs.map((p) => (
          <div key={p.id} className="port-row port-row--input">
            <Handle id={p.id} type="target" position={Position.Left} {...handleProps(p, 'input')}
              style={{ ['--port-color' as string]: portColor(p.type) }}
            />
            <span className="port-label">
              {t(p.labelKey)}{' '}
              <span className="port-type">
                <span className="port-glyph" style={{ color: portColor(p.type) }}>
                  {portGlyph(p.type)}
                </span>{' '}
                {t(`portTypes.${p.type}`)}
              </span>
            </span>
          </div>
        ))}

        {/* Выходы (OUTPUT) */}
        {def.outputs.map((p) => (
          <div key={p.id} className="port-row port-row--output justify-end text-right">
            <span className="port-label">
              {t(p.labelKey)}{' '}
              <span className="port-type">
                <span className="port-glyph" style={{ color: portColor(p.type) }}>
                  {portGlyph(p.type)}
                </span>{' '}
                {t(`portTypes.${p.type}`)}
              </span>
            </span>
            <Handle id={p.id} type="source" position={Position.Right} {...handleProps(p, 'output')}
              style={{ ['--port-color' as string]: portColor(p.type) }}
            />
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
