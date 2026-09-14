/**
 * Справочник деталей Академии (5.11E).
 *
 * Строится автоматически из живого реестра блоков — второго списка
 * деталей не существует. Запланированные детали помечены явно.
 * Карточки доступны с клавиатуры (нативный `details/summary`).
 */

import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { blockRegistry } from '@/core/registry/block-registry';
import { buildReference, filterReference, usedCategories, type ReferenceEntry, type ReferencePort } from '@/academy/reference';
import { getLesson } from '@/academy/catalog';
import type { BlockStatus } from '@/core/types/blocks';
import { cn } from '@/lib/utils';

const STATUS_ORDER: BlockStatus[] = ['implemented', 'prototype', 'experimental', 'planned', 'deprecated'];

const STATUS_BADGE: Record<BlockStatus, string> = {
  implemented: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  prototype: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  experimental: 'border-sky-400/40 bg-sky-400/10 text-sky-300',
  planned: 'border-rose-400/40 bg-rose-400/10 text-rose-300',
  deprecated: 'border-line bg-line/30 text-muted',
};

const KIND_GLYPH: Record<ReferencePort['kind'], string> = {
  data: '●',
  event: '◆',
  error: '■',
};

function PortList({ title, ports }: { title: string; ports: ReferencePort[] }) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">{title}</div>
      {ports.length === 0 ? (
        <div className="text-xs text-muted/70">—</div>
      ) : (
        <ul className="space-y-1">
          {ports.map((port) => (
            <li key={port.id} className="flex items-center gap-2 text-xs">
              <span aria-hidden className={cn('text-[9px]', port.kind === 'error' ? 'text-rose-300' : port.kind === 'event' ? 'text-violet-300' : 'text-cyan-300')}>
                {KIND_GLYPH[port.kind]}
              </span>
              <span>{t(port.labelKey)}</span>
              <span className="rounded bg-line/40 px-1.5 py-0.5 text-[10px] text-muted">
                {t(`portTypes.${port.type}`, { defaultValue: port.type })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReferenceCard({ entry, defaultOpen }: { entry: ReferenceEntry; defaultOpen?: boolean }) {
  const { t } = useTranslation();
  const lessonLinks = entry.lessonIds
    .map((id) => ({ id, lesson: getLesson(id) }))
    .filter((x) => x.lesson !== undefined);

  return (
    <details className="glass block rounded-2xl transition-all open:border-cyan-400/40" open={defaultOpen || undefined}>
      <summary className="flex cursor-pointer items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="text-xl">{entry.icon ?? '🧩'}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-bold">{t(entry.labelKey)}</span>
            {entry.trigger && (
              <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-300">
                {t('academy.reference.trigger')}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted">
            <span>{t(`categories.${entry.category}`, { defaultValue: entry.category })}</span>
            <span aria-hidden>·</span>
            <span>{t(`academy.difficulty.${entry.difficulty}`)}</span>
            <span aria-hidden>·</span>
            <span>{entry.inputs.length} {t('academy.reference.inputsShort')} / {entry.outputs.length} {t('academy.reference.outputsShort')}</span>
          </div>
        </div>
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', STATUS_BADGE[entry.status])}>
          {t(`academy.reference.statuses.${entry.status}`)}
        </span>
      </summary>
      <div className="space-y-3 border-t border-line/60 px-4 pb-4 pt-3">
        {entry.status === 'planned' && (
          <p className="rounded-lg border border-rose-400/30 bg-rose-400/5 px-3 py-2 text-xs text-rose-200">
            {t('academy.reference.plannedNotice')}
          </p>
        )}
        {entry.descriptionKey !== undefined && <p className="text-xs text-muted">{t(entry.descriptionKey)}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PortList title={t('academy.reference.inputs')} ports={entry.inputs} />
          <PortList title={t('academy.reference.outputs')} ports={entry.outputs} />
        </div>
        {lessonLinks.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">{t('academy.reference.lessons')}</div>
            <div className="flex flex-wrap gap-2">
              {lessonLinks.map(({ id, lesson }) => (
                <Link
                  key={id}
                  to={`/academy/lesson/${id}`}
                  className="rounded-full border border-cyan-400/30 bg-cyan-400/5 px-2.5 py-1 text-[11px] text-cyan-200 hover:border-cyan-400/60"
                >
                  🎓 {lesson !== undefined ? t(lesson.titleKey) : id}
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="text-[10px] text-muted/60">id: {entry.id}</div>
      </div>
    </details>
  );
}

export function BlockReferencePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const focusedBlock = params.get('block');
  const entries = useMemo(() => buildReference(blockRegistry.list()), []);
  const [query, setQuery] = useState(focusedBlock ?? '');
  const [category, setCategory] = useState('all');
  const [difficulty, setDifficulty] = useState<'all' | 'basic' | 'advanced'>('all');
  const [status, setStatus] = useState<'all' | BlockStatus>('all');

  const categories = useMemo(() => usedCategories(entries), [entries]);
  const filtered = useMemo(
    () => filterReference(entries, { category, difficulty, status, query }, (key) => (key !== undefined ? t(key) : '')),
    [entries, category, difficulty, status, query, t],
  );

  return (
    <div className="aurora min-h-screen bg-abyss text-ink">
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <button className="btn-ghost mb-4 !py-1.5 text-xs" onClick={() => navigate('/academy')}>
            ← {t('academy.reference.backToAcademy')}
          </button>
          <h1 className="text-gradient mb-1 text-3xl font-black tracking-tight">{t('academy.reference.title')}</h1>
          <p className="text-sm text-muted">{t('academy.reference.subtitle')}</p>
        </div>

        <div className="glass mb-4 flex flex-wrap items-center gap-2 rounded-2xl p-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('academy.reference.searchPlaceholder')}
            aria-label={t('academy.reference.searchPlaceholder')}
            className="input-dark min-w-[200px] flex-1"
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('academy.reference.filterCategory')} className="input-dark">
            <option value="all">{t('academy.reference.allCategories')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>{t(`categories.${c}`, { defaultValue: c })}</option>
            ))}
          </select>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)} aria-label={t('academy.reference.filterDifficulty')} className="input-dark">
            <option value="all">{t('academy.reference.allDifficulties')}</option>
            <option value="basic">{t('academy.difficulty.basic')}</option>
            <option value="advanced">{t('academy.difficulty.advanced')}</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label={t('academy.reference.filterStatus')} className="input-dark">
            <option value="all">{t('academy.reference.allStatuses')}</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{t(`academy.reference.statuses.${s}`)}</option>
            ))}
          </select>
          <span className="ml-auto whitespace-nowrap text-xs text-muted">
            {t('academy.reference.count', { shown: filtered.length, total: entries.length })}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center text-sm text-muted">{t('academy.reference.empty')}</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((entry) => (
              <ReferenceCard key={entry.id} entry={entry} defaultOpen={entry.id === focusedBlock} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
