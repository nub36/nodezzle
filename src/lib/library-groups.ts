/** Группы интерфейса: категории реестра и формат проекта не меняются. */
import { BLOCK_CATEGORIES, type BlockCategory } from '@/core/types/blocks';

export const LIBRARY_GROUPS = ['core', 'telegram', 'web', 'data', 'logic', 'flow', 'models', 'http', 'datetime', 'media', 'security', 'debug', 'ai', 'notes'] as const;
export function libraryGroup(category: BlockCategory): string {
  if (category.startsWith('telegram')) return 'telegram';
  if (category.startsWith('web')) return 'web';
  if (['data', 'memory', 'converters'].includes(category)) return 'data';
  return category;
}

export function migrateCollapsedCategories(previous: string[]): string[] {
  return LIBRARY_GROUPS.filter((group) => BLOCK_CATEGORIES.filter((c) => libraryGroup(c) === group).every((c) => previous.includes(c)));
}
