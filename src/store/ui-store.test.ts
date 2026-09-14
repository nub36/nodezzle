/**
 * Тесты UI-store (Этап 2, подэтап A): избранное, недавние, вкладки, категории.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { RECENT_LIMIT, useUiStore } from './ui-store';

function resetStore() {
  useUiStore.setState({
    libraryTab: 'basic',
    libraryQuery: '',
    canvasMode: 'draft',
    effectsEnabled: true,
    schemaQuery: '',
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

  it('поисковые строки не входят в сохраняемое состояние', () => {
    useUiStore.getState().setLibraryQuery('секрет');
    useUiStore.getState().setSchemaQuery('поиск');
    const persisted = useUiStore.persist.getOptions().partialize?.(useUiStore.getState()) as Record<string, unknown>;
    expect(persisted).not.toHaveProperty('libraryQuery');
    expect(persisted).not.toHaveProperty('schemaQuery');
    expect(persisted).toHaveProperty('favorites');
    expect(persisted).toHaveProperty('recent');
    expect(persisted).toHaveProperty('canvasMode');
    expect(persisted).toHaveProperty('effectsEnabled');
    expect(useUiStore.persist.getOptions().name).toBe('nodezzle-ui-v1');
  });

  it('режим схемы: черновик и живой режим', () => {
    expect(useUiStore.getState().canvasMode).toBe('draft');
    useUiStore.getState().setCanvasMode('live');
    expect(useUiStore.getState().canvasMode).toBe('live');
    useUiStore.getState().setCanvasMode('draft');
    expect(useUiStore.getState().canvasMode).toBe('draft');
  });

  it('визуальные эффекты включаются и выключаются', () => {
    expect(useUiStore.getState().effectsEnabled).toBe(true);
    useUiStore.getState().toggleEffects();
    expect(useUiStore.getState().effectsEnabled).toBe(false);
    useUiStore.getState().toggleEffects();
    expect(useUiStore.getState().effectsEnabled).toBe(true);
  });

  it('поиск по схеме хранится в сторе', () => {
    useUiStore.getState().setSchemaQuery('приветствие');
    expect(useUiStore.getState().schemaQuery).toBe('приветствие');
  });
});
