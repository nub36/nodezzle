/** На узком экране — одна немодальная панель или свободный холст. */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNarrowCanvas } from '@/lib/useNarrowCanvas';
import { CanvasIcon } from '@/components/CanvasIcon';
import { SiteMenu } from '@/features/navigation/SiteHeader';
import { useUiStore, type CanvasPanel } from '@/store/ui-store';

export function CanvasPanelSwitcher() {
  const { t } = useTranslation();
  const narrow = useNarrowCanvas();
  const libraryCollapsed = useUiStore((s) => s.libraryCollapsed);
  const inspectorCollapsed = useUiStore((s) => s.inspectorCollapsed);
  const setSide = useUiStore((s) => s.setSideCollapsed);
  const panel = useUiStore((s) => s.canvasPanel);
  const setPanel = useUiStore((s) => s.setCanvasPanel);
  const last = useRef<CanvasPanel>(null);
  const toggle = (next: CanvasPanel) => {
    if (!narrow) {
      if (next === null) { setSide('library', true); setSide('inspector', true); }
      else setSide(next, next === 'library' ? !libraryCollapsed : !inspectorCollapsed);
      return;
    }
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
      if (!narrow || event.key !== 'Escape' || !panel || document.querySelector('[data-testid="quick-insert-menu"], [data-canvas-menu], [aria-modal="true"], [data-site-menu][open]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPanel(null);
      document.getElementById(`panel-toggle-${last.current ?? panel}`)?.focus();
    };
    document.addEventListener('keydown', close, true);
    return () => document.removeEventListener('keydown', close, true);
  }, [panel, setPanel, narrow]);
  return (
    <nav className="canvas-section-nav flex shrink-0 items-center gap-2 border-b border-line/70 px-3 py-1.5" aria-label={t('canvas.panels.navigation')}>
      {(['library', 'inspector', null] as const).map((item) => (
        <button key={item ?? 'canvas'} id={`panel-toggle-${item ?? 'canvas'}`} data-testid={`panel-toggle-${item ?? 'canvas'}`}
          data-tutorial={`panel-toggle-${item ?? 'canvas'}`} className="btn-ghost justify-center !py-1.5 text-xs"
          aria-controls={item ? `canvas-${item}` : undefined} title={t(`canvas.panels.${item ?? 'canvas'}`)}
          aria-expanded={item ? narrow ? panel === item : item === 'library' ? !libraryCollapsed : !inspectorCollapsed : undefined}
          aria-pressed={item === null ? narrow ? panel === null : libraryCollapsed && inspectorCollapsed : undefined} onClick={() => toggle(item)}>
          <CanvasIcon name={item ?? 'canvas'} />{t(`canvas.panels.${item ?? 'canvas'}`)}
        </button>
      ))}
      <span className="canvas-stage-label">{t('canvas.design.editorLabel')}</span>
      <div className="ml-auto"><SiteMenu /></div>
    </nav>
  );
}
