/**
 * Веб-превью (Этап 2, подэтап I часть 2): живой предпросмотр страницы,
 * собранной из веб-деталей схемы (страница / кнопки / формы).
 *
 * Действия в превью запускают схему настоящими веб-событиями:
 * загрузка страницы, клик по кнопке, отправка формы — тот же
 * `TriggerPayload` (`source: 'web'`), что создаёт симулятор
 * (см. docs/WEB.md). Ответные элементы (текст, картинки, окна)
 * появятся вместе с библиотекой веб-элементов на Этапе 4.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { blockRegistry } from '@/core/registry/block-registry';
import { useExecutionStore } from '@/store/execution-store';
import { useProjectStore } from '@/store/project-store';
import { cn } from '@/lib/utils';
import { tryParseJson } from '@/lib/utils';
import { collectWebElements } from './web-preview-utils';

export function WebPreview() {
  const { t } = useTranslation();
  const nodes = useProjectStore((s) => s.nodes);
  const project = useProjectStore((s) => s.project);
  const fireWebTrigger = useExecutionStore((s) => s.fireWebTrigger);
  const running = useExecutionStore((s) => s.running);
  const status = useExecutionStore((s) => s.status);

  const elements = collectWebElements(nodes, (id) => blockRegistry.get(id), (key) => t(key));
  const [formDrafts, setFormDrafts] = useState<Record<string, string>>({});
  const pageFired = useRef(false);

  // Загрузка страницы: событие `web.page` при открытии превью (один раз).
  useEffect(() => {
    if (elements.page && !pageFired.current) {
      pageFired.current = true;
      void fireWebTrigger({ event: 'page_load', at: Date.now() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements.page?.nodeId]);

  if (!elements.page && elements.buttons.length === 0 && elements.forms.length === 0) {
    return (
      <div className="space-y-2 pt-3">
        <div className="text-xs text-muted/80">{t('execution.panel.web.empty')}</div>
        <div className="text-[11px] leading-relaxed text-muted/60">{t('execution.panel.web.emptyHint')}</div>
      </div>
    );
  }

  const address = `${(project?.name ?? 'app').toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'app'}.nodezzle.app`;

  const reload = () => {
    void fireWebTrigger({ event: 'page_load', at: Date.now() });
  };

  return (
    <div className="flex gap-4 pt-2">
      {/* Окно браузера */}
      <div className="min-w-[300px] flex-1 overflow-hidden rounded-xl border border-line/60 bg-white/[0.03]">
        <div className="flex items-center gap-2 border-b border-line/50 bg-abyss/60 px-3 py-1.5">
          <span className="flex gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          </span>
          <span className="flex-1 truncate rounded-md bg-panel px-2 py-0.5 text-center font-mono text-[10px] text-muted">
            https://{address}
          </span>
          <button
            className="text-muted transition-colors hover:text-ink disabled:opacity-40"
            title={t('execution.panel.web.reload')}
            disabled={running}
            onClick={reload}
          >
            ⟳
          </button>
        </div>

        <div className="max-h-[130px] space-y-3 overflow-y-auto p-4">
          {elements.page && (
            <div className="text-sm font-bold text-ink">{elements.page.label}</div>
          )}
          {elements.buttons.map((b) => (
            <button
              key={b.nodeId}
              className="btn-primary !px-4 !py-1.5 !text-xs"
              disabled={running}
              onClick={() => void fireWebTrigger({ event: 'button_click', button: b.label, at: Date.now() })}
            >
              {b.label}
            </button>
          ))}
          {elements.forms.map((f) => {
            const draft = formDrafts[f.nodeId] ?? '{ "name": "Иван", "email": "ivan@example.com" }';
            return (
              <div key={f.nodeId} className="rounded-lg border border-line/50 bg-panel/60 p-2.5">
                <div className="mb-1 text-[11px] font-semibold text-muted">📋 {f.label}</div>
                <textarea
                  className="input-dark h-12 resize-none font-mono text-[11px]"
                  value={draft}
                  onChange={(e) => setFormDrafts((d) => ({ ...d, [f.nodeId]: e.target.value }))}
                />
                <button
                  className="btn-ghost mt-1.5 !px-3 !py-1 !text-[11px]"
                  disabled={running}
                  onClick={() =>
                    void fireWebTrigger({
                      event: 'form_submit',
                      form: f.label,
                      values: tryParseJson(draft, {}) as Record<string, unknown>,
                      at: Date.now(),
                    })
                  }
                >
                  {t('execution.panel.web.submit')}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Пояснение и статус последнего события */}
      <div className="w-[220px] shrink-0 space-y-2">
        <p className="text-[11px] leading-relaxed text-muted/70">{t('execution.panel.web.hint')}</p>
        <div className={cn('status-chip', `status-${status}`)}>
          <span className="status-dot" />
          {t(`execution.status.${status}`)}
        </div>
      </div>
    </div>
  );
}
