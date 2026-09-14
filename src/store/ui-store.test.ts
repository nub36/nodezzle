/**
 * Тесты UI-store (Этап 2, подэтап A): избранное, недавние, вкладки, категории.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { RECENT_LIMIT, useUiStore } from './ui-store';

function resetStore() {
  useUiStore.setState({
    libraryTab: 'basic',
    libraryQuery: '',
    favorites: [],
    recent: [],
    collapsedCategories: [],
  });
}

describe('UI-store: библиотека деталей', () => {
  beforeEach(resetStore);

  it('вкладка и строка поиска переключаются', () => {
    useUiStore.getState().setLibraryTab('favorites');
    useUiStore.getState().setLibraryQuery('телеграм');
    const s = useUiStore.getState();
    expect(s.libraryTab).toBe('favorites');
    expect(s.libraryQuery).toBe('телеграм');
  });

  it('избранное: добавление и снятие звёздочки', () => {
    useUiStore.getState().toggleFavorite('core.text');
    useUiStore.getState().toggleFavorite('flow.delay');
    expect(useUiStore.getState().favorites).toEqual(['core.text', 'flow.delay']);

    useUiStore.getState().toggleFavorite('core.text');
    expect(useUiStore.getState().favorites).toEqual(['flow.delay']);
  });

  it('недавние: новые в начале, без дублей', () => {
    useUiStore.getState().recordRecent('a.one');
    useUiStore.getState().recordRecent('b.two');
    useUiStore.getState().recordRecent('a.one');
    expect(useUiStore.getState().recent).toEqual(['a.one', 'b.two']);
  });

  it('недавние: список ограничен', () => {
    for (let i = 0; i < RECENT_LIMIT + 5; i += 1) {
      useUiStore.getState().recordRecent(`block.${i}`);
    }
    const recent = useUiStore.getState().recent;
    expect(recent).toHaveLength(RECENT_LIMIT);
    expect(recent[0]).toBe(`block.${RECENT_LIMIT + 4}`);
  });

  it('категории: сворачивание и разворачивание', () => {
    useUiStore.getState().toggleCategory('telegram');
    expect(useUiStore.getState().collapsedCategories).toEqual(['telegram']);
    useUiStore.getState().toggleCategory('telegram');
    expect(useUiStore.getState().collapsedCategories).toEqual([]);
  });

  it('поисковая строка не входит в сохраняемое состояние', () => {
    useUiStore.getState().setLibraryQuery('секрет');
    const persisted = useUiStore.persist.getOptions().partialize?.(useUiStore.getState()) as Record<string, unknown>;
    expect(persisted).not.toHaveProperty('libraryQuery');
    expect(persisted).toHaveProperty('favorites');
    expect(persisted).toHaveProperty('recent');
    expect(useUiStore.persist.getOptions().name).toBe('nodezzle-ui-v1');
  });
});
