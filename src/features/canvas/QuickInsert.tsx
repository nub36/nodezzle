import { CanvasIcon } from '@/components/CanvasIcon';
/**
 * Быстрая вставка (Этап 2, подэтап D).
 *
 * Два сценария:
 * 1. Пустой Canvas — стартовые детали: триггеры Telegram, триггеры Web,
 *    базовые значения. Клик — деталь создаётся на свободном месте ближе к центру.
 * 2. Соединение протянуто от порта и отпущено на пустом месте — всплывающее
 *    меню ТОЛЬКО совместимых деталей (правила умных соединений). Выбор
 *    создаёт деталь рядом и автоматически подключает её к исходному порту.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '@/store/ui-store';
import { useProjectStore } from '@/store/project-store';
import type { BlockDefinition } from '@/core/types/blocks';
import type { DndPayload, QuickInsertCandidate } from './library-utils';

function QuickBlockButton({ def, onPick }: { def: BlockDefinition; onPick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      className="flex w-full items-center gap-2 rounded-lg border border-line/60 bg-panel/60 px-2.5 py-1.5 text-left transition-colors hover:border-cyan-400/50 hover:bg-cyan-400/10"
      onClick={onPick}
      title={def.descriptionKey ? t(def.descriptionKey) : def.id}
    >
      <span className="text-sm" aria-hidden="true">
        {def.ui?.icon ?? '🧩'}
      </span>
      <span className="truncate text-xs font-medium">{t(def.labelKey)}</span>
    </button>
  );
}

/** Всплывающее меню быстрой вставки от порта. */
export function QuickInsertMenu({
  candidates,
  x,
  y,
  onPick,
  onClose,
}: {
  candidates: QuickInsertCandidate[];
  x: number;
  y: number;
  onPick: (candidate: QuickInsertCandidate) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onClose(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="glass-strong pointer-events-auto absolute z-20 w-60 rounded-xl p-2"
      style={{ left: x, top: y }}
      data-testid="quick-insert-menu"
    >
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted">
          {t('canvas.quickInsert.title')}
        </span>
        <button className="px-1 text-xs text-muted hover:text-ink" onClick={onClose} title={t('common.close')}>
          ✕
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {candidates.length === 0 && (
          <div className="px-2 py-4 text-center text-xs text-muted">
            {t('canvas.quickInsert.noCompatible')}
          </div>
        )}
        {candidates.map(({ def, port }) => (
          <div key={`${def.id}:${port.id}`} className="mb-1 last:mb-0">
            <QuickBlockButton def={def} onPick={() => onPick({ def, port })} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 px-1 text-[10px] leading-snug text-muted/70">
        {t('canvas.quickInsert.hint')}
      </div>
    </div>
  );
}

/** Стартовые детали на пустом Canvas. */
export function QuickInsertStarter({ onInsert }: { onInsert: (payload: DndPayload) => void }) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  const choose = (kind: 'telegram' | 'web' | 'empty') => {
    const store = useProjectStore.getState();
    if (!store.activeModelId) store.setProjectKind(kind);
    useUiStore.getState().setCanvasPanel(null);
    if (kind === 'empty') {
      setDismissed(true);
      useUiStore.getState().setSideCollapsed('library', false);
      useUiStore.getState().setCanvasPanel('library');
      useUiStore.getState().setLibraryQuery('');
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-testid=library-search]')?.focus());
      return;
    }
    if (useUiStore.getState().noviceMode && !store.activeModelId) {
      useUiStore.getState().setSideCollapsed('library', true);
      useUiStore.getState().setSideCollapsed('inspector', true);
    }
    onInsert({ blockId: kind === 'telegram' ? 'telegram.message_received' : 'core.text',
      ...(kind === 'web' ? { config: { value: t('novice.webExample') } } : {}) });
  };
  if (dismissed) return null;
  return <section data-testid="empty-onboarding" className="canvas-welcome pointer-events-auto" aria-labelledby="canvas-welcome-title">
    <div className="canvas-welcome-emblem" aria-hidden="true"><CanvasIcon name="library" /></div>
    <p className="canvas-welcome-eyebrow">{t('canvas.design.welcomeEyebrow')}</p>
    <h2 id="canvas-welcome-title">{t('novice.startTitle')}</h2>
    <p className="canvas-welcome-intro">{t('novice.startHint')}</p>
    <div className="canvas-start-options">{(['telegram', 'web'] as const).map((kind) =>
      <button key={kind} className={`canvas-start-card canvas-start-card--${kind}`} data-testid={`start-${kind}`} onClick={() => choose(kind)}>
        <span className="canvas-start-icon"><CanvasIcon name={kind} /></span>
        <strong>{t(`novice.start.${kind}`)}</strong>
        <span className="canvas-start-description">{t(`canvas.design.startDescription.${kind}`)}</span>
        <span className="canvas-start-arrow" aria-hidden="true">↗</span>
      </button>
    )}</div>
    <button className="canvas-start-blank" data-testid="start-empty" onClick={() => choose('empty')}><CanvasIcon name="empty" />{t('novice.start.empty')}<span aria-hidden="true">→</span></button>
    <p className="canvas-welcome-footnote">{t('canvas.design.welcomeFootnote')}</p>
  </section>;
}
