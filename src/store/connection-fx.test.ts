/**
 * Тесты эфемерного стора эффектов соединения (0.5.28):
 * «готов к подключению», вспышка успеха и её сброс по таймауту.
 * Это временное UI-состояние — оно не сериализуется и не смешивается
 * с состоянием выполнения (execution-store).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONNECT_SUCCESS_MS, useConnectionFxStore } from './connection-fx-store';

function resetStore() {
  useConnectionFxStore.getState().resetConnectionFx();
}

describe('Стор эффектов соединения', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hover-порт («готов к подключению») ставится и чистится', () => {
    const s = useConnectionFxStore.getState();
    expect(s.hoverPort).toBeNull();
    s.setHoverPort({ nodeId: 'n2', portId: 'value' });
    expect(useConnectionFxStore.getState().hoverPort).toEqual({ nodeId: 'n2', portId: 'value' });
    s.clearHoverPort();
    expect(useConnectionFxStore.getState().hoverPort).toBeNull();
  });

  it('повторный набор того же порта не создаёт новое состояние', () => {
    const s = useConnectionFxStore.getState();
    s.setHoverPort({ nodeId: 'n2', portId: 'value' });
    const ref = useConnectionFxStore.getState().hoverPort;
    s.setHoverPort({ nodeId: 'n2', portId: 'value' });
    expect(useConnectionFxStore.getState().hoverPort).toBe(ref); // та же ссылка — перерисовок нет
  });

  it('successful connection: вспышка появляется и гаснет по таймауту', () => {
    useConnectionFxStore.getState().markConnectSuccess({
      edgeId: 'e1',
      sourceNodeId: 'src',
      targetNodeId: 'tgt',
    });
    const fx = useConnectionFxStore.getState().success;
    expect(fx).not.toBeNull();
    expect(fx?.edgeId).toBe('e1');
    expect(fx?.sourceNodeId).toBe('src');
    expect(fx?.targetNodeId).toBe('tgt');

    vi.advanceTimersByTime(CONNECT_SUCCESS_MS - 10);
    expect(useConnectionFxStore.getState().success).not.toBeNull();
    vi.advanceTimersByTime(20);
    expect(useConnectionFxStore.getState().success).toBeNull();
  });

  it('вспышка несёт конкретные порты — вспыхивают именно соединённые', () => {
    useConnectionFxStore.getState().markConnectSuccess({
      edgeId: 'e1',
      sourceNodeId: 'src',
      targetNodeId: 'tgt',
      sourcePortId: 'text',
      targetPortId: 'value',
    });
    const fx = useConnectionFxStore.getState().success;
    expect(fx?.sourcePortId).toBe('text');
    expect(fx?.targetPortId).toBe('value');
  });

  it('вспышка при установке гасит «готов к подключению»', () => {
    const s = useConnectionFxStore.getState();
    s.setHoverPort({ nodeId: 'n2', portId: 'value' });
    s.markConnectSuccess({ edgeId: 'e1', sourceNodeId: 'src', targetNodeId: 'n2' });
    expect(useConnectionFxStore.getState().hoverPort).toBeNull();
    expect(useConnectionFxStore.getState().success?.edgeId).toBe('e1');
  });

  it('вторая вспышка подряд перезапускает таймер, а не складывается', () => {
    const s = useConnectionFxStore.getState();
    s.markConnectSuccess({ edgeId: 'e1', sourceNodeId: 'a', targetNodeId: 'b' });
    vi.advanceTimersByTime(300);
    s.markConnectSuccess({ edgeId: 'e2', sourceNodeId: 'c', targetNodeId: 'd' });
    vi.advanceTimersByTime(CONNECT_SUCCESS_MS - 10);
    expect(useConnectionFxStore.getState().success?.edgeId).toBe('e2');
    vi.advanceTimersByTime(20);
    expect(useConnectionFxStore.getState().success).toBeNull();
  });

  it('resetConnectionFx чистит всё и отменяет таймер', () => {
    const s = useConnectionFxStore.getState();
    s.markConnectSuccess({ edgeId: 'e1', sourceNodeId: 'a', targetNodeId: 'b' });
    s.resetConnectionFx();
    expect(useConnectionFxStore.getState().success).toBeNull();
    vi.advanceTimersByTime(CONNECT_SUCCESS_MS * 2);
    expect(useConnectionFxStore.getState().success).toBeNull();
  });
});
