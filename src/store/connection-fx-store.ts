/**
 * NODEZZLE — эфемерные эффекты соединений (временное UI-состояние).
 *
 * ВАЖНО: этот стор — только визуальный слой. Он НЕ сериализуется в
 * Project JSON и не попадает в файл проекта: никаких `isGlowing`,
 * `justConnected`, `animationTime` в данных схемы нет и не будет.
 *
 * Состояния:
 *  - `hoverPort` — порт, над которым сейчас находится перетаскиваемое
 *    соединение и куда МОЖНО подключиться (состояние READY TO CONNECT);
 *  - `success` — короткое подтверждение успешного соединения
 *    (вспышка портов и блоков, импульс по линии), живёт ~650 мс.
 *
 * События выполнения (RUNNING/SUCCESS/ERROR) живут отдельно — в
 * `execution-store` (nodeStates/flowEdges) и с этим стором не
 * смешиваются.
 */

import { create } from 'zustand';

/** Сколько длится подтверждение соединения, мс. */
export const CONNECT_SUCCESS_MS = 650;

export interface HoverPort {
  nodeId: string;
  portId: string;
}

export interface ConnectSuccessFx {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  /** Момент создания соединения (для диагностики/тестов). */
  at: number;
}

interface ConnectionFxState {
  hoverPort: HoverPort | null;
  success: ConnectSuccessFx | null;

  setHoverPort: (port: HoverPort) => void;
  clearHoverPort: () => void;
  markConnectSuccess: (fx: Omit<ConnectSuccessFx, 'at'>) => void;
  clearConnectSuccess: () => void;
  /** Полный сброс (напр. при выходе с холста). */
  resetConnectionFx: () => void;
}

let successTimer: ReturnType<typeof setTimeout> | null = null;

export const useConnectionFxStore = create<ConnectionFxState>()((set, get) => ({
  hoverPort: null,
  success: null,

  setHoverPort: (port) => {
    const current = get().hoverPort;
    if (current !== null && current.nodeId === port.nodeId && current.portId === port.portId) {
      return; // тот же порт — никаких обновлений (и никаких перерисовок)
    }
    set({ hoverPort: port });
  },

  clearHoverPort: () => {
    if (get().hoverPort !== null) set({ hoverPort: null });
  },

  markConnectSuccess: (fx) => {
    if (successTimer !== null) clearTimeout(successTimer);
    set({ success: { ...fx, at: Date.now() }, hoverPort: null });
    successTimer = setTimeout(() => {
      successTimer = null;
      set({ success: null });
    }, CONNECT_SUCCESS_MS);
  },

  clearConnectSuccess: () => {
    if (successTimer !== null) {
      clearTimeout(successTimer);
      successTimer = null;
    }
    set({ success: null });
  },

  resetConnectionFx: () => {
    if (successTimer !== null) {
      clearTimeout(successTimer);
      successTimer = null;
    }
    set({ hoverPort: null, success: null });
  },
}));
