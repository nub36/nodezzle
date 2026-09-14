/**
 * Инспектор — контекстная правая панель (Этап 2, подэтап E).
 *
 * Содержание зависит от выделения:
 *  - выбрана деталь — инспектор блока (существующий `ConfigPanel`;
 *    для «Вызов модели» дополнительно показывает контракт модели);
 *  - выбрано соединение — инспектор соединения: порты, типы, последнее
 *    значение, прошедшее по связи, удаление;
 *  - ничего не выбрано — инспектор холста: свойства проекта, переменные, сводка.
 *
 * Веб-элементы инспектируются тем же инспектором блока (их параметры —
 * конфигурация веб-детали), отдельная панель не дублируется.
 */

import type { Edge } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { blockRegistry } from '@/core/registry/block-registry';
import { portColor } from '@/core/type-system/compatibility';
import { useProjectStore } from '@/store/project-store';
import { useUiStore } from '@/store/ui-store';
import { useExecutionStore } from '@/store/execution-store';
import { safeStringify } from '@/lib/utils';
import { ConfigPanel } from './ConfigPanel';

function PanelShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  const selectNode = useProjectStore((s) => s.selectNode);
  const selectEdge = useProjectStore((s) => s.selectEdge);
  return (
    <div className="glass pointer-events-auto flex max-h-full w-[280px] flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
        <span className="text-xs font-bold uppercase tracking-wider">{title}</span>
        <button
          className="text-muted transition-colors hover:text-ink"
          onClick={() => {
            selectNode(null);
            selectEdge(null);
            useUiStore.getState().setCanvasPanel(null);
            document.getElementById('panel-toggle-inspector')?.focus();
          }}
          title={t('common.close')}
        >
          ✕
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
    </div>
  );
}

function TypeChip({ type }: { type: string }) {
  const { t } = useTranslation();
  return (
    <span
      className="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ color: portColor(type), borderColor: `${portColor(type)}55` }}
    >
      {t(`portTypes.${type}`, type)}
    </span>
  );
}

/** Инспектор соединения: порты, типы, последнее значение, удаление. */
function ConnectionInspector({ edge }: { edge: Edge }) {
  const { t } = useTranslation();
  const nodes = useProjectStore((s) => s.nodes);
  const deleteEdge = useProjectStore((s) => s.deleteEdge);
  const sourceInfo = useExecutionStore((s) => s.nodeInfo[edge.source]);

  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);
  const sourceDef = sourceNode ? blockRegistry.get(sourceNode.data.blockId) : undefined;
  const targetDef = targetNode ? blockRegistry.get(targetNode.data.blockId) : undefined;
  const sourcePort = sourceDef?.outputs.find((p) => p.id === edge.sourceHandle);
  const targetPort = targetDef?.inputs.find((p) => p.id === edge.targetHandle);

  const sourceLabel = sourceNode?.data.label || (sourceDef ? t(sourceDef.labelKey) : '?');
  const targetLabel = targetNode?.data.label || (targetDef ? t(targetDef.labelKey) : '?');

  // Последнее значение, прошедшее по связи: выход источника в прошлом запуске.
  const lastValue = sourceInfo?.outputs
    ? (sourceInfo.outputs as Record<string, unknown>)[edge.sourceHandle ?? '']
    : undefined;

  return (
    <PanelShell title={t('canvas.inspector.connection.title')}>
      <div className="space-y-3 text-[11.5px]">
        <div className="rounded-xl border border-line/60 bg-abyss/40 p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="truncate font-medium">{sourceLabel}</span>
            {sourcePort && <TypeChip type={sourcePort.type} />}
          </div>
          <div className="text-muted">
            {sourcePort ? t(sourcePort.labelKey) : edge.sourceHandle} ↓
          </div>
        </div>
        <div className="rounded-xl border border-line/60 bg-abyss/40 p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="truncate font-medium">{targetLabel}</span>
            {targetPort && <TypeChip type={targetPort.type} />}
          </div>
          <div className="text-muted">
            {targetPort ? t(targetPort.labelKey) : edge.targetHandle}
          </div>
        </div>

        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted">
            {t('canvas.inspector.connection.lastData')}
          </div>
          {lastValue === undefined ? (
            <div className="text-[11px] text-muted/60">{t('canvas.inspector.connection.noData')}</div>
          ) : (
            <pre className="log-json">{safeStringify(lastValue)}</pre>
          )}
        </div>

        <button className="btn-ghost w-full !border-red-400/40 !text-red-300" onClick={() => deleteEdge(edge.id)}>
          {t('canvas.inspector.connection.delete')}
        </button>
      </div>
    </PanelShell>
  );
}

/** Инспектор холста: свойства проекта, переменные, сводка. */
function CanvasInspector() {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);
  if (!project) return null;

  return (
    <PanelShell title={t('canvas.inspector.canvas.title')}>
      <div className="space-y-3 text-[11.5px]">
        <div>
          <div className="mb-1 text-[11px] font-medium text-muted">{t('common.name')}</div>
          <div className="truncate font-semibold">{project.name}</div>
        </div>

        <div className="rounded-xl border border-line/60 bg-abyss/40 p-3 leading-relaxed text-muted">
          <div>
            {t('canvas.inspector.canvas.kind')}: {t(`dashboard.kinds.${project.kind}`)}
          </div>
          <div>
            {t('canvas.inspector.canvas.format')}: v{project.formatVersion}
          </div>
          <div>
            {t('canvas.inspector.canvas.counts')}: {nodes.length} · {edges.length} · {project.models.length}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
            {t('canvas.inspector.canvas.variables')}
          </div>
          {project.variables.length === 0 ? (
            <div className="text-[11px] text-muted/60">{t('canvas.inspector.canvas.noVariables')}</div>
          ) : (
            <ul className="space-y-1">
              {project.variables.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{v.name}</span>
                  <TypeChip type={v.type} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[10.5px] leading-snug text-muted/70">{t('canvas.inspector.canvas.hint')}</p>
      </div>
    </PanelShell>
  );
}

/** Точка входа: инспектор по текущему выделению. */
export function InspectorPanel() {
  const selectedNodeId = useProjectStore((s) => s.selectedNodeId);
  const selectedEdge = useProjectStore((s) => s.edges.find((e) => e.selected));

  if (selectedNodeId) return <ConfigPanel />;
  if (selectedEdge) return <ConnectionInspector edge={selectedEdge} />;
  return <CanvasInspector />;
}
