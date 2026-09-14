/** Ограничение окна урока экраном, без изменения схемы и прогресса. */
export interface WindowPoint { x: number; y: number }
export function clampWindowPosition(point: WindowPoint, size: { width: number; height: number }, viewport: { width: number; height: number }): WindowPoint {
  const margin = 8;
  const limit = (value: number, extent: number, screen: number) =>
    Math.min(Math.max(Number.isFinite(value) ? value : margin, margin), Math.max(margin, screen - extent - margin));
  return { x: limit(point.x, size.width, viewport.width), y: limit(point.y, size.height, viewport.height) };
}
