/**
 * Кастомный узел Canvas: рендерится из Block Definition.
 *
 * - порты (INPUT/OUTPUT) — из дефиниции, с типами и цветами;
 * - подсветка совместимых портов во время перетаскивания соединения
 *   (УМНЫЕ СОЕДИНЕНИЯ);
 * - визуальные состояния живого выполнения: RUNNING (неоновый пульс),
 *   SUCCESS (мягкий зелёный), ERROR (красный), SKIPPED (приглушён).
 */

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { blockRegistry } from '@/core/registry/block-registry';
import { checkCompatibility, portColor } from '@/core/type-system/compatibility';
import type { PortDefinition } from '@/core/types/ports';
import type { CanvasNodeData } from '@/core/project/serialize';
import { useProjectStore } from '@/store/project-store';
import { useExecutionStore } from '@/store/execution-store';
import { cn, translateError } from '@/lib/utils';

type PortVisualState = 'neutral' | 'compatible' | 'incompatible';

export function NodezzleNode({ id, data, selected }: NodeProps) {
  const { t } = useTranslation();
  const nodeData = data as unknown as CanvasNodeData;
  const def = blockRegistry.get(nodeData.blockId);
  const status = useExecutionStore((s) => s.nodeStates[id]);
  const runInfo = useExecutionStore((s) => s.nodeInfo[id]);
  const dragPort = useProjectStore((s) => s.dragPort);

  if (!def) {
    return (
      <div className="nodezzle-node status-error p-3 text-xs text-red-300">
        ⚠️ {t('canvas.node.noBlock')}: {nodeData.blockId}
      </div>
    );
  }

  const portState = (port: PortDefinition, direction: 'input' | 'output'): PortVisualState => {
    if (!dragPort || dragPort.nodeId === id) return 'neutral';
    let allowed: boolean;
    if (dragPort.direction === 'output') {
      if (direction !== 'input') return 'neutral';
      allowed = checkCompatibility(
        { id: dragPort.portId, labelKey: '', kind: dragPort.kind, type: dragPort.type },
        port,
      ).allowed;
    } else {
      if (direction !== 'output') return 'neutral';
      allowed = checkCompatibility(port, {
        id: dragPort.portId,
        labelKey: '',
        kind: dragPort.kind,
        type: dragPort.type,
      }).allowed;
    }
    return allowed ? 'compatible' : 'incompatible';
  };

  const title = nodeData.label || t(def.labelKey);

  return (
    <div
      className={cn(
        'nodezzle-node',
        selected && 'selected',
        status === 'running' && 'status-running',
        status === 'success' && 'status-success',
        status === 'error' && 'status-error',
        status === 'skipped' && 'status-skipped',
      )}
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
        {def.inputs.map((p) => {
          const state = portState(p, 'input');
          return (
            <div key={p.id} className="port-row port-row--input">
              <Handle
                id={p.id}
                type="target"
                position={Position.Left}
                className={cn('nzz-handle', state === 'compatible' && 'port-compatible', state === 'incompatible' && 'port-incompatible')}
                style={{ ['--port-color' as string]: portColor(p.type) }}
              />
              <span className="port-label">
                {t(p.labelKey)} <span className="port-type">· {t(`portTypes.${p.type}`)}</span>
              </span>
            </div>
          );
        })}

        {/* Выходы (OUTPUT) */}
        {def.outputs.map((p) => {
          const state = portState(p, 'output');
          return (
            <div key={p.id} className="port-row port-row--output justify-end text-right">
              <span className="port-label">
                {t(p.labelKey)} <span className="port-type">· {t(`portTypes.${p.type}`)}</span>
              </span>
              <Handle
                id={p.id}
                type="source"
                position={Position.Right}
                className={cn(
                  'nzz-handle',
                  state === 'compatible' && 'port-compatible',
                  state === 'incompatible' && 'port-incompatible',
                )}
                style={{ ['--port-color' as string]: portColor(p.type) }}
              />
            </div>
          );
        })}
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
