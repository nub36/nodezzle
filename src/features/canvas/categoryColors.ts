/** Акцентные цвета категорий деталей (minimap, метки). */

import type { BlockCategory } from '@/core/types/blocks';

export const CATEGORY_COLORS: Record<BlockCategory, string> = {
  core: '#22d3ee',
  logic: '#a78bfa',
  data: '#a3e635',
  flow: '#fbbf24',
  telegram: '#60a5fa',
  web: '#f472b6',
  models: '#34d399',
  memory: '#fb923c',
  http: '#38bdf8',
  datetime: '#38bdf8',
  media: '#f472b6',
  security: '#f87171',
  debug: '#94a3b8',
  ai: '#e879f9',
};
