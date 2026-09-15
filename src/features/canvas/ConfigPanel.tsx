/**
 * Инспектор выбранной детали: переименование, конфигурация (параметры
 * из Block Definition.defaults), техническая информация и результат
 * последнего выполнения (DEBUG: входы/выходы, время).
 */

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { blockRegistry } from '@/core/registry/block-registry';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { useExecutionStore } from '@/store/execution-store';
import { isWebField } from '@/core/web/field-element';
import { CONDITION_OPERATORS } from '@/blocks/logic/blocks';
import { cn, safeStringify, translateError } from '@/lib/utils';

/** Контракт выбранной модели для блока «Вызов модели» (Этап 2, подэтап E). */
function ModelContractInfo({ blockId, modelId }: { blockId: string; modelId: string }) {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  if (blockId !== 'models.call') return null;
  const model = project?.models.find((m) => m.id === modelId);
  if (!model) {
    return (
      <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-[11px] text-amber-200">
        {t('canvas.inspector.model.noModel')}
      </div>
    );
  }
  const rows: Array<{ key: string; ports: typeof model.contract.inputs }> = [
    { key: 'inputs', ports: model.contract.inputs },
    { key: 'outputs', ports: model.contract.outputs },
    { key: 'error', ports: model.contract.error ? [model.contract.error] : [] },
  ];
  return (
    <div>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
        {t('canvas.inspector.model.title')}
      </div>
      <div className="space-y-2 rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-3 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-semibold">📦 {model.name}</span>
          <span className="text-muted">
            {t('canvas.inspector.model.version')}: {model.version}
          </span>
        </div>
        {rows.map(({ key, ports }) =>
          ports.length === 0 ? null : (
            <div key={key}>
              <div className="mb-1 text-muted">{t(`canvas.inspector.model.${key}`)}</div>
              <div className="flex flex-wrap gap-1">
                {ports.map((p) => (
                  <span key={p.id} className="rounded-full border border-line/70 px-1.5 py-0.5 text-[10px]">
                    {p.name} <span className="opacity-60">· {p.type}</span>
                  </span>
                ))}
              </div>
            </div>
          ),
        )}
        <div className="text-[10px] leading-snug text-muted/70">{t('canvas.inspector.model.openHint')}</div>
      </div>
    </div>
  );
}

export function ConfigPanel() {
  const { t } = useTranslation();
  const novice = useUiStore((s) => s.noviceMode);
  const selectedNodeId = useProjectStore((s) => s.selectedNodeId);
  const nodes = useProjectStore((s) => s.nodes);
  const setNodeConfig = useProjectStore((s) => s.setNodeConfig);
  const setNodeLabel = useProjectStore((s) => s.setNodeLabel);
  const selectNode = useProjectStore((s) => s.selectNode);
  const runInfo = useExecutionStore((s) => (selectedNodeId ? s.nodeInfo[selectedNodeId] : undefined));

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;
  const def = blockRegistry.get(node.data.blockId);
  if (!def) return null;

  const config = node.data.config ?? {};
  const configKeys = node.data.blockId === 'web.form' ? [...new Set([...Object.keys(def.defaults ?? {}), ...Object.keys(config)])] : def.defaults ? Object.keys(def.defaults) : Object.keys(config);
  const lastRun = runInfo;

  return (
    <div className="glass pointer-events-auto flex max-h-full w-[280px] flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true">{def.ui?.icon}</span>
          <span className="text-xs font-bold uppercase tracking-wider">{t('canvas.inspector.title')}</span>
        </div>
        <button className="text-muted transition-colors hover:text-ink" onClick={() => {
          selectNode(null);
          useUiStore.getState().setCanvasPanel(null);
          document.getElementById('panel-toggle-inspector')?.focus();
        }} title={t('common.close')}>
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <div className="mb-1 text-[11px] font-medium text-muted">{t('canvas.inspector.label')}</div>
          <input
            className="input-dark"
            value={node.data.label ?? ''}
            placeholder={t(def.labelKey)}
            onChange={(e) => setNodeLabel(node.id, e.target.value)}
          />
        </div>

        {def.descriptionKey && (
          <p className="text-[11.5px] leading-relaxed text-muted">{t(def.descriptionKey)}</p>
        )}

        {configKeys.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
              {t('canvas.inspector.config')}
            </div>
            <div className="space-y-2.5">
              {configKeys.map((key) => {
                const value = config[key];
                const labelKey = isWebField(node.data.blockId) && key === 'label' ? 'fieldLabel' : node.data.blockId === 'web.modal' && key === 'title' ? 'modalTitle' : key;
                if ((key === 'formMode' && node.data.blockId === 'web.form') || (key === 'formNodeId' && isWebField(node.data.blockId))) {
                  const forms = nodes.filter((n) => n.data.blockId === 'web.form');
                  return <label key={key} className="block">
                    <span className="mb-1 block text-[11px] text-muted">{t(`blocks.config.${labelKey}`)}</span>
                    <select className="input-dark" aria-label={t(`blocks.config.${labelKey}`)} value={String(value ?? (key === 'formMode' ? 'json' : ''))} onChange={(e) => setNodeConfig(node.id, key, e.target.value)}>
                      {key === 'formMode' ? <>
                        <option value="json">{t('execution.panel.web.jsonMode')}</option>
                        <option value="fields">{t('execution.panel.web.fieldsMode')}</option>
                      </> : <>
                        <option value="">{t('execution.panel.web.chooseForm')}</option>
                        {value && !forms.some((f) => f.id === value) ? <option value={String(value)}>{t('execution.panel.web.missingForm')}</option> : null}
                        {forms.map((f, index) => <option key={f.id} value={f.id}>{String(f.data.label || f.data.config.label || t('blocks.web.form.label'))} · {index + 1}</option>)}
                      </>}
                    </select>
                  </label>;
                }
                if (node.data.blockId === 'telegram.inline_keyboard' && key === 'rows') {
                  return <label key={key} className="block">
                    <span className="mb-1 block text-[11px] text-muted">{t('blocks.config.keyboardRows')}</span>
                    <textarea aria-label={t('blocks.config.keyboardRows')} className="input-dark h-24 resize-y font-mono text-xs" value={typeof value === 'string' ? value : ''}
                      onChange={(e) => setNodeConfig(node.id, key, e.target.value)} />
                  </label>;
                }
                if (key === 'operator') {
                  return (
                    <label key={key} className="block">
                      <span className="mb-1 block text-[11px] text-muted">{t(`blocks.config.${labelKey}`)}</span>
                      <select
                        className="input-dark"
                        value={String(value ?? '')}
                        onChange={(e) => setNodeConfig(node.id, key, e.target.value)}
                      >
                        {CONDITION_OPERATORS.map((op) => (
                          <option key={op} value={op}>
                            {t(`blocks.operators.${op}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }
                if (node.data.blockId === 'telegram.answer_callback' && key === 'show_alert') {
                  return <label key={key} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={value === true} onChange={(e) => setNodeConfig(node.id, key, e.target.checked)} />
                    {t('blocks.config.show_alert')}
                  </label>;
                }
                const isNumber = typeof value === 'number';
                return (
                  <label key={key} className="block">
                    <span className="mb-1 block text-[11px] text-muted">{t(`blocks.config.${labelKey}`, key)}</span>
                    <input
                      className="input-dark"
                      type={isNumber ? 'number' : 'text'}
                      value={value === undefined || value === null ? '' : String(value)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setNodeConfig(node.id, key, isNumber ? (raw === '' ? '' : Number(raw)) : raw);
                      }}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Техническая информация */}
        <details key={node.id} open={!novice} className="text-[11px] leading-relaxed text-muted">
          <summary className="cursor-pointer py-2">{t('novice.technical')}</summary>
          <div>
            {t('canvas.inspector.info')}: <code className="text-cyan-300">{def.id}</code>
          </div>
          <div>
            {t('canvas.inspector.category')}: {t(`categories.${def.category}`)}
          </div>
          <div>
            <Link
              to={`/academy/reference?block=${encodeURIComponent(def.id)}`}
              className="text-cyan-300 hover:underline"
            >
              ? {t('canvas.library.help')}
            </Link>
          </div>
        </details>

        <ModelContractInfo blockId={def.id} modelId={String(config.modelId ?? '')} />

        {/* Последнее выполнение (DEBUG) */}
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
            {t('canvas.inspector.lastRun')}
          </div>
          {!lastRun ? (
            <div className="text-[11px] text-muted/60">{t('canvas.inspector.noRun')}</div>
          ) : (
            <div className="space-y-2 text-[11px]">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    lastRun.status === 'success' && 'bg-emerald-400',
                    lastRun.status === 'error' && 'bg-red-400',
                    lastRun.status === 'running' && 'bg-cyan-400',
                  )}
                />
                <span>{lastRun.durationMs} мс</span>
                <span className="text-muted">· {t('canvas.inspector.duration')}</span>
              </div>
              {lastRun.error && <div className="text-red-300">⛔ {translateError(lastRun.error)}</div>}
              <div>
                <div className="mb-1 text-muted">{t('canvas.inspector.inputs')}</div>
                <pre className="log-json">{safeStringify(lastRun.inputs)}</pre>
              </div>
              <div>
                <div className="mb-1 text-muted">{t('canvas.inspector.outputs')}</div>
                <pre className="log-json">{safeStringify(lastRun.outputs)}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
