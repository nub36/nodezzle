/**
 * Чистые функции визуального состояния портов во время перетаскивания
 * соединения («умные соединения»). Вынесены из компонента, чтобы
 * логика тестировалась без React и DOM.
 */

import { checkCompatibility } from '@/core/type-system/compatibility';
import type { PortDefinition } from '@/core/types/ports';
import type { DragPortInfo } from '@/store/project-store';

/** Визуальное состояние порта. */
export type PortVisualState = 'neutral' | 'compatible' | 'incompatible';

/**
 * Состояние порта при текущем перетаскивании соединения.
 *
 * - нет перетаскивания — все порты нейтральны;
 * - порты ИСХОДНОГО узла остаются нейтральными (источник подсвечивается
 *   отдельно, состоянием `active`);
 * - тянем из OUTPUT — оцениваются только входы (и наоборот).
 */
export function getPortVisualState(
  dragPort: DragPortInfo | null,
  ownNodeId: string,
  port: PortDefinition,
  direction: 'input' | 'output',
): PortVisualState {
  if (dragPort === null || dragPort.nodeId === ownNodeId) return 'neutral';
  if (dragPort.direction === 'output') {
    if (direction !== 'input') return 'neutral';
    const source: PortDefinition = {
      id: dragPort.portId,
      labelKey: '',
      kind: dragPort.kind,
      type: dragPort.type,
    };
    return checkCompatibility(source, port).allowed ? 'compatible' : 'incompatible';
  }
  if (direction !== 'output') return 'neutral';
  const target: PortDefinition = {
    id: dragPort.portId,
    labelKey: '',
    kind: dragPort.kind,
    type: dragPort.type,
  };
  return checkCompatibility(port, target).allowed ? 'compatible' : 'incompatible';
}

/** Тянут ли сейчас соединение из этого конкретного порта. */
export function isSourcePortActive(
  dragPort: DragPortInfo | null,
  nodeId: string,
  portId: string,
): boolean {
  return dragPort !== null && dragPort.nodeId === nodeId && dragPort.portId === portId;
}

/**
 * Данные для тултипа несовместимого порта: «Несовместимый тип:
 * Текст → Число» (типы — сырые идентификаторы, подпись делает i18n).
 */
export function incompatibleTooltip(
  dragPort: DragPortInfo,
  port: PortDefinition,
): { fromType: string; toType: string } {
  if (dragPort.direction === 'output') {
    return { fromType: dragPort.type, toType: port.type };
  }
  return { fromType: port.type, toType: dragPort.type };
}
