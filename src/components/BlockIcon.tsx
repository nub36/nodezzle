import { CanvasIcon, type CanvasIconName } from './CanvasIcon';

/** Векторные версии частых символов реестра. Не привязаны к ID блоков;
 * неизвестная иконка продолжает отображаться из Block Definition. */
const vectorIcons: Record<string, CanvasIconName> = {
  '📝': 'text', '🔤': 'text', '🔢': 'number', '💬': 'message',
  '📨': 'telegram', '📤': 'telegram', '🔤→1': 'convert', '1→🔤': 'convert',
};
export function BlockIcon({ icon }: { icon?: string }) {
  const name = icon ? vectorIcons[icon] : undefined;
  return name ? <CanvasIcon name={name} /> : <span className="block-icon-symbol" aria-hidden="true">{icon ?? '◇'}</span>;
}
