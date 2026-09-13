/**
 * Библиотека деталей (NodePalette): категории, поиск, drag & drop.
 *
 * Показывает только available-блоки (зарезервированные — скрыты).
 * Будущие секции: Избранное, Недавние, Мои детали, Мои модели,
 * Community / Marketplace (см. docs/UI.md, ROADMAP).
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { blockRegistry } from '@/core/registry/block-registry';
import { BLOCK_CATEGORIES, type BlockCategory } from '@/core/types/blocks';

const DND_MIME = 'application/nodezzle-block';

export function NodePalette({ onAddAtCenter }: { onAddAtCenter: (blockId: string) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<BlockCategory>>(new Set());

  const sections = useMemo(() => {
    const all = blockRegistry.available();
    const q = query.trim().toLowerCase();
    return BLOCK_CATEGORIES.map((category) => ({
      category,
      items: all.filter(
        (b) =>
          b.category === category &&
          (q === '' ||
            t(b.labelKey).toLowerCase().includes(q) ||
            (b.descriptionKey ? t(b.descriptionKey).toLowerCase().includes(q) : false)),
      ),
    })).filter((s) => s.items.length > 0);
  }, [query, t]);

  const toggle = (c: BlockCategory) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  return (
    <div className="glass pointer-events-auto flex h-full w-[264px] flex-col rounded-2xl">
      <div className="border-b border-line/70 p-3">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
          {t('canvas.palette.title')}
        </div>
        <input
          className="input-dark"
          placeholder={t('canvas.palette.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {sections.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-muted">{t('common.noResults')}</div>
        )}
        {sections.map(({ category, items }) => {
          const isCollapsed = collapsed.has(category);
          return (
            <div key={category} className="mb-1">
              <button
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted transition-colors hover:text-ink"
                onClick={() => toggle(category)}
              >
                {t(`categories.${category}`)}
                <span className="text-[10px] opacity-60">{isCollapsed ? '▸' : '▾'}</span>
              </button>
              {!isCollapsed &&
                items.map((b) => (
                  <div
                    key={b.id}
                    className="palette-item"
                    draggable
                    title={b.descriptionKey ? t(b.descriptionKey) : b.id}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DND_MIME, b.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={() => onAddAtCenter(b.id)}
                  >
                    <span className="text-sm" aria-hidden="true">
                      {b.ui?.icon ?? '🧩'}
                    </span>
                    <span className="flex-1 truncate text-xs font-medium">{t(b.labelKey)}</span>
                    {b.trigger === true && (
                      <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_6px_rgba(232,121,249,0.9)]" />
                    )}
                  </div>
                ))}
            </div>
          );
        })}
      </div>

      <div className="border-t border-line/70 p-3 text-[10.5px] leading-snug text-muted/70">
        {t('canvas.palette.dragHint')}
      </div>
    </div>
  );
}

export { DND_MIME };
