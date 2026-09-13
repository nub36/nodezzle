/**
 * Инспектор выбранной детали: переименование, конфигурация (параметры
 * из Block Definition.defaults), техническая информация и результат
 * последнего выполнения (DEBUG: входы/выходы, время).
 */

import { useTranslation } from 'react-i18next';
import { blockRegistry } from '@/core/registry/block-registry';
import { useProjectStore } from '@/store/project-store';
import { useExecutionStore } from '@/store/execution-store';
import { CONDITION_OPERATORS } from '@/blocks/logic/blocks';
import { cn, safeStringify, translateError } from '@/lib/utils';

export function ConfigPanel() {
  const { t } = useTranslation();
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
  const configKeys = def.defaults ? Object.keys(def.defaults) : Object.keys(config);
  const lastRun = runInfo;

  return (
    <div className="glass pointer-events-auto flex max-h-full w-[280px] flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true">{def.ui?.icon}</span>
          <span className="text-xs font-bold uppercase tracking-wider">{t('canvas.inspector.title')}</span>
        </div>
        <button className="text-muted transition-colors hover:text-ink" onClick={() => selectNode(null)} title={t('common.close')}>
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
                if (key === 'operator') {
                  return (
                    <label key={key} className="block">
                      <span className="mb-1 block text-[11px] text-muted">{t(`blocks.config.${key}`)}</span>
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
                const isNumber = typeof value === 'number';
                return (
                  <label key={key} className="block">
                    <span className="mb-1 block text-[11px] text-muted">{t(`blocks.config.${key}`, key)}</span>
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
        <div className="rounded-xl border border-line/60 bg-abyss/40 p-3 text-[10.5px] leading-relaxed text-muted">
          <div>
            {t('canvas.inspector.info')}: <code className="text-cyan-300">{def.id}</code>
          </div>
          <div>
            {t('canvas.inspector.category')}: {t(`categories.${def.category}`)}
          </div>
        </div>

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
