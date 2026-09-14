/**
 * Поиск помощи и контекстные подсказки Академии (5.11F).
 *
 * Чистые функции поверх каталога уроков и справочника деталей:
 * ищут и по урокам, и по деталям реестра. Те же данные использует
 * контекстная помощь на Canvas и «ошибки как обучение».
 */

import type { LessonDefinition } from './types';
import type { ReferenceEntry } from './reference';

/** Элемент индекса помощи: урок или деталь. */
export interface HelpIndexEntry {
  kind: 'lesson' | 'block';
  id: string;
  titleKey: string;
  descriptionKey?: string;
  keywords: string[];
}

/** Индекс помощи из каталога уроков и справочника деталей. */
export function buildHelpIndex(
  lessons: readonly LessonDefinition[],
  reference: readonly ReferenceEntry[],
): HelpIndexEntry[] {
  const fromLessons: HelpIndexEntry[] = lessons.map((l) => ({
    kind: 'lesson',
    id: l.id,
    titleKey: l.titleKey,
    descriptionKey: l.descriptionKey,
    keywords: [],
  }));
  const fromBlocks: HelpIndexEntry[] = reference.map((e) => ({
    kind: 'block',
    id: e.id,
    titleKey: e.labelKey,
    descriptionKey: e.descriptionKey,
    keywords: e.keywords,
  }));
  return [...fromLessons, ...fromBlocks];
}

export interface HelpSearchResult {
  entry: HelpIndexEntry;
  /** Чем выше — тем точнее совпадение. */
  score: number;
}

/**
 * Поиск по индексу помощи. Минимальная длина запроса — 2 символа;
 * приоритет: совпадение с начала названия > в названии > в описании >
 * в ключевых словах и идентификаторе.
 */
export function searchHelp(
  index: readonly HelpIndexEntry[],
  query: string,
  resolve: (key: string | undefined) => string,
  limit = 12,
): HelpSearchResult[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const results: HelpSearchResult[] = [];
  for (const entry of index) {
    const title = resolve(entry.titleKey).toLowerCase();
    const description = entry.descriptionKey !== undefined ? resolve(entry.descriptionKey).toLowerCase() : '';
    let score = 0;
    if (title.startsWith(q)) score = 100;
    else if (title.includes(q)) score = 80;
    else if (description.includes(q)) score = 50;
    else if (entry.id.toLowerCase().includes(q)) score = 30;
    else if (entry.keywords.some((k) => k.toLowerCase().includes(q))) score = 30;
    if (score > 0) results.push({ entry, score });
  }
  return results
    .sort((a, b) => b.score - a.score || a.entry.titleKey.localeCompare(b.entry.titleKey))
    .slice(0, limit);
}

/** Состояние холста для контекстных подсказок. */
export interface CanvasContext {
  nodeCount: number;
  hasSelection: boolean;
  /** Статус последнего запуска, если был. */
  lastRunStatus?: 'success' | 'error' | 'finished';
}

export interface ContextSuggestion {
  /** i18n-ключ текста подсказки. */
  textKey: string;
  /** Куда ведёт: урок или справочник. */
  to: string;
}

/**
 * Контекстные подсказки на Canvas: честные рекомендации из
 * существующих уроков и справочника.
 */
export function contextHelp(ctx: CanvasContext): ContextSuggestion[] {
  const out: ContextSuggestion[] = [];
  if (ctx.nodeCount === 0) {
    out.push({ textKey: 'academy.help.suggestEmptyCanvas', to: '/academy/lesson/intro-canvas' });
  } else {
    if (ctx.lastRunStatus === 'error') {
      out.push({ textKey: 'academy.help.suggestRunError', to: '/academy/lesson/basics-chain' });
    } else if (ctx.lastRunStatus === undefined) {
      out.push({ textKey: 'academy.help.suggestNotRunYet', to: '/academy/lesson/basics-chain' });
    }
    if (ctx.hasSelection) {
      out.push({ textKey: 'academy.help.suggestSelectedBlock', to: '/academy/reference' });
    }
    out.push({ textKey: 'academy.help.suggestReference', to: '/academy/reference' });
  }
  return out;
}

/**
 * «Ошибки как обучение»: по коду ошибки рантайма — куда отправить
 * пользователя. Только существующие уроки/справочник.
 */
export function lessonForErrorCode(code?: string): { kind: 'lesson' | 'reference'; id: string } {
  switch (code) {
    case 'ERR_EMPTY_CANVAS':
    case 'ERR_NO_TRIGGER':
    case 'ERR_CYCLE':
      return { kind: 'lesson', id: 'basics-chain' };
    case 'ERR_INVALID_NUMBER':
    case 'ERR_INVALID_JSON':
    case 'ERR_INVALID_BOOLEAN':
    case 'ERR_INVALID_OBJECT':
    case 'ERR_EMPTY_INPUT':
    case 'ERR_OUT_OF_RANGE':
    case 'ERR_KEY_NOT_FOUND':
    case 'ERR_INVALID_DATE':
      return { kind: 'lesson', id: 'data-converters' };
    case 'ERR_MODEL_NOT_FOUND':
    case 'ERR_MODEL_EXECUTION':
      return { kind: 'lesson', id: 'models-first-model' };
    default:
      return { kind: 'reference', id: '' };
  }
}

/** Маршрут помощи по коду ошибки. */
export function helpRouteForError(code?: string): string {
  const target = lessonForErrorCode(code);
  return target.kind === 'lesson' ? `/academy/lesson/${target.id}` : '/academy/reference';
}
