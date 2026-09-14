/** На узком экране — одна немодальная панель или свободный холст. */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore, type CanvasPanel } from '@/store/ui-store';

export function CanvasPanelSwitcher() {
  const { t } = useTranslation();
  const panel = useUiStore((s) => s.canvasPanel);
  const setPanel = useUiStore((s) => s.setCanvasPanel);
  const last = useRef<CanvasPanel>(null);
  const toggle = (next: CanvasPanel) => {
    const target = panel === next ? null : next;
    last.current = next;
    setPanel(target);
    if (target) requestAnimationFrame(() => {
      (document.querySelector<HTMLElement>(`#canvas-${target} input`) ?? document.querySelector<HTMLElement>(`#canvas-${target} button`))?.focus();
    });
  };
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      // У открытого меню/диалога свой приоритет Escape; не закрываем панель под ним.
      if (event.key !== 'Escape' || !panel || document.querySelector('[data-testid="quick-insert-menu"], [data-canvas-menu], [aria-modal="true"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPanel(null);
      document.getElementById(`panel-toggle-${last.current ?? panel}`)?.focus();
    };
    document.addEventListener('keydown', close, true);
    return () => document.removeEventListener('keydown', close, true);
  }, [panel, setPanel]);
  return (
    <nav className="flex shrink-0 gap-2 border-b border-line/70 px-3 py-1.5" aria-label={t('canvas.panels.navigation')}>
      {(['library', 'inspector', null] as const).map((item) => (
        <button key={item ?? 'canvas'} id={`panel-toggle-${item ?? 'canvas'}`} data-testid={`panel-toggle-${item ?? 'canvas'}`}
          data-tutorial={`panel-toggle-${item ?? 'canvas'}`} className="btn-ghost flex-1 justify-center !py-2 text-xs"
          aria-controls={item ? `canvas-${item}` : undefined} aria-expanded={item ? panel === item : undefined}
          aria-pressed={item === null ? panel === null : undefined} onClick={() => toggle(item)}>
          {t(`canvas.panels.${item ?? 'canvas'}`)}
        </button>
      ))}
    </nav>
  );
}
