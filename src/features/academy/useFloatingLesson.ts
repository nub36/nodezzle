/** Перетаскивание мышью/пером/касанием и стрелками; положение живёт в сессии вкладки. */
import { useLayoutEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { clampWindowPosition, type WindowPoint } from '@/lib/floating-window';

const KEY = 'nodezzle-lesson-window';
function readPosition(): WindowPoint | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    if (value && Number.isFinite(value.x) && Number.isFinite(value.y)) return { x: value.x, y: value.y };
  } catch { /* Закрытое хранилище не мешает перемещению. */ }
  return undefined;
}

export function useFloatingLesson(layoutKey: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<WindowPoint | undefined>(readPosition);
  const current = useRef(position);
  const drag = useRef<{ id: number; offset: WindowPoint } | null>(null);

  const move = (point: WindowPoint) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const next = clampWindowPosition(point, rect, { width: window.innerWidth, height: window.innerHeight });
    current.current = next;
    setPosition((prev) => prev?.x === next.x && prev?.y === next.y ? prev : next);
    try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Без сохранения. */ }
  };
  const reset = () => {
    current.current = undefined;
    setPosition(undefined);
    try { sessionStorage.removeItem(KEY); } catch { /* Без сохранения. */ }
  };

  useLayoutEffect(() => {
    const keepVisible = () => { if (current.current) move(current.current); };
    keepVisible();
    const observer = new ResizeObserver(keepVisible);
    if (ref.current) observer.observe(ref.current);
    window.addEventListener('resize', keepVisible);
    return () => { observer.disconnect(); window.removeEventListener('resize', keepVisible); };
  }, [layoutKey]);

  return {
    ref,
    style: position ? { left: position.x, top: position.y, right: 'auto' } : undefined,
    reset,
    handle: {
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0 || !ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        drag.current = { id: e.pointerId, offset: { x: e.clientX - rect.left, y: e.clientY - rect.top } };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.focus();
        e.preventDefault();
      },
      onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
        if (drag.current?.id !== e.pointerId) return;
        move({ x: e.clientX - drag.current.offset.x, y: e.clientY - drag.current.offset.y });
      },
      onPointerUp: (e: PointerEvent<HTMLButtonElement>) => {
        if (drag.current?.id === e.pointerId) {
          drag.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      },
      onLostPointerCapture: () => { drag.current = null; },
      onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'Home') { e.preventDefault(); reset(); return; }
        const delta: Record<string, WindowPoint> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
        const direction = delta[e.key];
        if (!direction || !ref.current) return;
        e.preventDefault();
        const rect = ref.current.getBoundingClientRect();
        const distance = e.shiftKey ? 48 : 16;
        move({ x: rect.left + direction.x * distance, y: rect.top + direction.y * distance });
      },
    },
  };
}
