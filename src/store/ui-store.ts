/**
 * NODEZZLE — UI-store: состояние интерфейса (Этап 2, подэтап A).
 *
 * Отдельный стор для настроек интерфейса, не связанных с документом проекта:
 * активная вкладка библиотеки, строка поиска, избранные и недавние детали,
 * свёрнутые категории; режим схемы «Черновик/Живой», визуальные эффекты
 * и поиск по схеме (Этап 2, подэтап B).
 * Избранное/недавние/вкладка/режим/эффекты сохраняются в LocalStorage
 * (persist), чтобы настройки переживали перезагрузку страницы.
 *
 * Поисковые строки НЕ сохраняются — это состояние текущей сессии.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Вкладки библиотеки деталей. */
export type LibraryTab = 'basic' | 'all' | 'favorites' | 'recent' | 'myPieces' | 'myModels';

/** Режим работы со схемой (Этап 2, подэтап B). */
export type CanvasMode = 'draft' | 'live';

/** Сколько недавних деталей храним. */
export const RECENT_LIMIT = 10;

interface UiState {
  libraryTab: LibraryTab;
  libraryQuery: string;
  canvasMode: CanvasMode;
  /** Визуальные эффекты выполнения (частицы по соединениям). */
  effectsEnabled: boolean;
  /** Поиск по схеме (состояние сессии, не сохраняется). */
  schemaQuery: string;
  /** Режим фокуса: приглушить всё, кроме выбранной детали и её связей. */
  focusMode: boolean;
  /** Открыта ли панель отладки (нужна Академии, подэтап 5.11). */
  debugOpen: boolean;
  /** Избранные блоки (порядок добавления). */
  favorites: string[];
  /** Недавние блоки: от новых к старым, без дублей. */
  recent: string[];
  /** Свёрнутые категории библиотеки. */
  collapsedCategories: string[];

  setLibraryTab: (tab: LibraryTab) => void;
  setLibraryQuery: (query: string) => void;
  setCanvasMode: (mode: CanvasMode) => void;
  toggleEffects: () => void;
  setSchemaQuery: (query: string) => void;
  toggleFocusMode: () => void;
  setDebugOpen: (open: boolean) => void;
  toggleFavorite: (blockId: string) => void;
  recordRecent: (blockId: string) => void;
  toggleCategory: (category: string) => void;
}

/** Небольшое хранилище в памяти — фолбэк, если localStorage недоступен (тесты). */
const memory = new Map<string, string>();
const memoryStorage: Storage = {
  get length() {
    return memory.size;
  },
  clear: () => memory.clear(),
  getItem: (k) => (memory.has(k) ? memory.get(k)! : null),
  key: (i) => [...memory.keys()][i] ?? null,
  removeItem: (k) => {
    memory.delete(k);
  },
  setItem: (k, v) => {
    memory.set(k, String(v));
  },
};

function resolveStorage(): Storage {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // localStorage запрещён (приватный режим и т. п.) — работаем в памяти.
  }
  return memoryStorage;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      libraryTab: 'basic',
      libraryQuery: '',
      canvasMode: 'draft',
      effectsEnabled: true,
      schemaQuery: '',
      focusMode: false,
      debugOpen: true,
      favorites: [],
      recent: [],
      collapsedCategories: [],

      setDebugOpen: (open) => set({ debugOpen: open }),
      setLibraryTab: (tab) => set({ libraryTab: tab }),
      setLibraryQuery: (query) => set({ libraryQuery: query }),
      setCanvasMode: (mode) => set({ canvasMode: mode }),
      toggleEffects: () => set((state) => ({ effectsEnabled: !state.effectsEnabled })),
      setSchemaQuery: (query) => set({ schemaQuery: query }),
      toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),

      toggleFavorite: (blockId) =>
        set((state) => ({
          favorites: state.favorites.includes(blockId)
            ? state.favorites.filter((id) => id !== blockId)
            : [...state.favorites, blockId],
        })),

      recordRecent: (blockId) =>
        set((state) => ({
          recent: [blockId, ...state.recent.filter((id) => id !== blockId)].slice(0, RECENT_LIMIT),
        })),

      toggleCategory: (category) =>
        set((state) => ({
          collapsedCategories: state.collapsedCategories.includes(category)
            ? state.collapsedCategories.filter((c) => c !== category)
            : [...state.collapsedCategories, category],
        })),
    }),
    {
      name: 'nodezzle-ui-v1',
      storage: createJSONStorage(resolveStorage),
      // Поисковая строка — состояние сессии, не сохраняем.
      partialize: (state) => ({
        libraryTab: state.libraryTab,
        canvasMode: state.canvasMode,
        effectsEnabled: state.effectsEnabled,
        focusMode: state.focusMode,
        favorites: state.favorites,
        recent: state.recent,
        collapsedCategories: state.collapsedCategories,
      }),
    },
  ),
);
