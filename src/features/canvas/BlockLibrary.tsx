/**
 * Библиотека деталей v2 (Этап 2, подэтап A).
 *
 * Развитие палитры (ранее — NodePalette): вкладки «Основные / Все / Избранное /
 * Недавние / Мои детали / Мои модели», поиск по названию, описанию, идентификатору
 * и ключевым словам, звёздочки избранного, вставка моделей проекта блоком
 * «Вызов модели» (с предзаполненным modelId).
 *
 * Состояние интерфейса — в UI-store (src/store/ui-store.ts): избранное, недавние
 * и активная вкладка сохраняются между сессиями.
 *
 * Показываются только available-блоки (зарезервированные скрыты).
 * «Мои детали» — заготовка раздела: пользовательские детали появятся после
 * «Сохранить как деталь» (Этап 2, раздел G). Статус честно отражается в пустом
 * состоянии, а не выдаётся за готовую функцию.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { blockRegistry } from '@/core/registry/block-registry';
import { BLOCK_CATEGORIES, type BlockCategory, type BlockDefinition } from '@/core/types/blocks';
import { useUiStore, type LibraryTab } from '@/store/ui-store';
import { useProjectStore } from '@/store/project-store';
import { CATEGORY_COLORS, CATEGORY_ICONS } from './categoryColors';
import { DND_MIME, encodeDnd, matchesQuery, type DndPayload } from './library-utils';
import { cn } from '@/lib/utils';

const TABS: { id: LibraryTab; labelKey: string }[] = [
  { id: 'basic', labelKey: 'canvas.library.tabs.basic' },
  { id: 'all', labelKey: 'canvas.library.tabs.all' },
  { id: 'favorites', labelKey: 'canvas.library.tabs.favorites' },
  { id: 'recent', labelKey: 'canvas.library.tabs.recent' },
  { id: 'myPieces', labelKey: 'canvas.library.tabs.myPieces' },
  { id: 'myModels', labelKey: 'canvas.library.tabs.myModels' },
];

/** Строка детали: перетаскивание на Canvas или клик (вставка в центр). */
function BlockRow({ def, onInsert }: { def: BlockDefinition; onInsert: (payload: DndPayload) => void }) {
  const { t } = useTranslation();
  const isFavorite = useUiStore((s) => s.favorites.includes(def.id));
  const toggleFavorite = useUiStore((s) => s.toggleFavorite);

  return (
    <div
      className="palette-item group"
      draggable
      title={def.descriptionKey ? t(def.descriptionKey) : def.id}
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_MIME, encodeDnd({ blockId: def.id }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => onInsert({ blockId: def.id })}
    >
      <span className="text-sm" aria-hidden="true">
        {def.ui?.icon ?? '🧩'}
      </span>
      <span className="flex-1 truncate text-xs font-medium">{t(def.labelKey)}</span>
      {def.trigger === true && (
        <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_6px_rgba(232,121,249,0.9)]" />
      )}
      <button
        className={cn(
          'px-0.5 text-sm leading-none transition-opacity',
          isFavorite
            ? 'text-amber-300 opacity-100'
            : 'text-muted opacity-0 hover:text-amber-200 group-hover:opacity-100',
        )}
        title={t(isFavorite ? 'canvas.library.removeFavorite' : 'canvas.library.addFavorite')}
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite(def.id);
        }}
      >
        {isFavorite ? '★' : '☆'}
      </button>
    </div>
  );
}

/** Строка модели проекта: вставляется блоком «Вызов модели». */
function ModelRow({
  model,
  onInsert,
}: {
  model: { id: string; name: string };
  onInsert: (payload: DndPayload) => void;
}) {
  const { t } = useTranslation();
  const payload: DndPayload = { blockId: 'models.call', config: { modelId: model.id } };
  return (
    <div
      className="palette-item"
      draggable
      title={t('canvas.library.insertModel')}
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_MIME, encodeDnd(payload));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => onInsert(payload)}
    >
      <span className="text-sm" aria-hidden="true">
        📦
      </span>
      <span className="flex-1 truncate text-xs font-medium">{model.name}</span>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="px-3 py-6 text-center">
      <div className="mb-2 text-2xl" aria-hidden="true">
        {icon}
      </div>
      <div className="text-xs leading-relaxed text-muted">{text}</div>
    </div>
  );
}

export function BlockLibrary({ onInsert }: { onInsert: (payload: DndPayload) => void }) {
  const { t } = useTranslation();
  const tab = useUiStore((s) => s.libraryTab);
  const query = useUiStore((s) => s.libraryQuery);
  const favorites = useUiStore((s) => s.favorites);
  const recent = useUiStore((s) => s.recent);
  const collapsed = useUiStore((s) => s.collapsedCategories);
  const setTab = useUiStore((s) => s.setLibraryTab);
  const setQuery = useUiStore((s) => s.setLibraryQuery);
  const toggleCategory = useUiStore((s) => s.toggleCategory);
  const models = useProjectStore((s) => s.project?.models);

  const available = useMemo(() => blockRegistry.available(), []);

  const textsOf = (def: BlockDefinition) => ({
    label: t(def.labelKey),
    description: def.descriptionKey ? t(def.descriptionKey) : '',
  });

  const byId = (ids: string[]) =>
    ids.map((id) => available.find((b) => b.id === id)).filter((b): b is BlockDefinition => Boolean(b));

  // Режим «Основные» — только базовые детали; «Все» — все доступные.
  const pool = tab === 'basic' ? available.filter((b) => b.difficulty !== 'advanced') : available;

  const sections = useMemo(() => {
    const filtered = pool.filter((b) => matchesQuery(b, query, textsOf(b)));
    return BLOCK_CATEGORIES.map((category: BlockCategory) => ({
      category,
      items: filtered.filter((b) => b.category === category),
    })).filter((s) => s.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, query, t]);

  const favoriteBlocks = byId(favorites).filter((b) => matchesQuery(b, query, textsOf(b)));
  const recentBlocks = byId(recent).filter((b) => matchesQuery(b, query, textsOf(b)));
  const projectModels = (models ?? []).filter((m) => m.name.toLowerCase().includes(query.trim().toLowerCase()));

  const showCategories = tab === 'basic' || tab === 'all';

  return (
    <div className="glass pointer-events-auto flex h-full w-[280px] flex-col rounded-2xl">
      <div className="border-b border-line/70 p-3">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
          {t('canvas.library.title')}
        </div>
        <div className="mb-2 flex flex-wrap gap-1">
          {TABS.map(({ id, labelKey }) => (
            <button
              key={id}
              className={cn(
                'rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold transition-colors',
                tab === id
                  ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-100'
                  : 'border-transparent text-muted hover:border-line hover:text-ink',
              )}
              onClick={() => setTab(id)}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <input
          className="input-dark"
          placeholder={t('canvas.library.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {showCategories && (
          <>
            {sections.length === 0 && (
              <div className="px-2 py-6 text-center text-xs text-muted">{t('common.noResults')}</div>
            )}
            {sections.map(({ category, items }) => {
              const isCollapsed = collapsed.includes(category);
              return (
                <div key={category} className="mb-1">
                  <button
                    className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted transition-colors hover:text-ink"
                    onClick={() => toggleCategory(category)}
                  >
                    <span aria-hidden="true">{CATEGORY_ICONS[category]}</span>
                    <span className="flex-1">{t(`categories.${category}`)}</span>
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[category] }}
                    />
                    <span className="text-[10px] opacity-60">{isCollapsed ? '▸' : '▾'}</span>
                  </button>
                  {!isCollapsed && items.map((b) => <BlockRow key={b.id} def={b} onInsert={onInsert} />)}
                </div>
              );
            })}
          </>
        )}

        {tab === 'favorites' &&
          (favoriteBlocks.length > 0 ? (
            favoriteBlocks.map((b) => <BlockRow key={b.id} def={b} onInsert={onInsert} />)
          ) : (
            <EmptyState icon="⭐" text={t(query ? 'common.noResults' : 'canvas.library.favoritesEmpty')} />
          ))}

        {tab === 'recent' &&
          (recentBlocks.length > 0 ? (
            recentBlocks.map((b) => <BlockRow key={b.id} def={b} onInsert={onInsert} />)
          ) : (
            <EmptyState icon="🕘" text={t(query ? 'common.noResults' : 'canvas.library.recentEmpty')} />
          ))}

        {tab === 'myPieces' && <EmptyState icon="🧩" text={t('canvas.library.myPiecesEmpty')} />}

        {tab === 'myModels' &&
          (projectModels.length > 0 ? (
            projectModels.map((m) => <ModelRow key={m.id} model={m} onInsert={onInsert} />)
          ) : (
            <EmptyState icon="📦" text={t(query ? 'common.noResults' : 'canvas.library.myModelsEmpty')} />
          ))}
      </div>

      <div className="border-t border-line/70 p-3 text-[10.5px] leading-snug text-muted/70">
        {t('canvas.library.dragHint')}
      </div>
    </div>
  );
}
