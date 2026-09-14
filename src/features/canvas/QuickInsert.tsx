/**
 * Быстрая вставка (Этап 2, подэтап D).
 *
 * Два сценария:
 * 1. Пустой Canvas — стартовые детали: триггеры Telegram, триггеры Web,
 *    базовые значения. Клик — деталь создаётся в центре схемы.
 * 2. Соединение протянуто от порта и отпущено на пустом месте — всплывающее
 *    меню ТОЛЬКО совместимых деталей (правила умных соединений). Выбор
 *    создаёт деталь рядом и автоматически подключает её к исходному порту.
 */

import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { blockRegistry } from '@/core/registry/block-registry';
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
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="glass-strong pointer-events-auto absolute z-20 w-60 rounded-xl p-2"
      style={{ left: x, top: y }}
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

  const groups = useMemo(() => {
    const available = blockRegistry.available();
    const telegram = available.filter((b) => b.trigger === true && b.category === 'telegram');
    const web = available.filter((b) => b.trigger === true && b.category === 'web');
    const values = available.filter((b) => ['core.text', 'core.number', 'core.json'].includes(b.id));
    return [
      { key: 'startTelegram', items: telegram },
      { key: 'startWeb', items: web },
      { key: 'startValues', items: values },
    ].filter((g) => g.items.length > 0);
  }, []);

  return (
    <div className="glass pointer-events-auto max-w-md rounded-2xl px-6 py-5">
      <div className="mb-2 text-center text-3xl" aria-hidden="true">
        🧩
      </div>
      <div className="mb-1 text-center text-sm font-bold">{t('canvas.empty.title')}</div>
      <div className="mb-4 text-center text-xs leading-relaxed text-muted">{t('canvas.empty.lead')}</div>
      <div className="grid gap-3">
        {groups.map((group) => (
          <div key={group.key}>
            <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted">
              {t(`canvas.empty.${group.key}`)}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {group.items.map((def) => (
                <QuickBlockButton key={def.id} def={def} onPick={() => onInsert({ blockId: def.id })} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
