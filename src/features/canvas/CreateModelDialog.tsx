/**
 * Диалог «Создать модель из выделенного» (Этап 2, подэтап G).
 *
 * Показывает имя будущей модели, состав выделения и автоматически
 * определённый контракт (ВХОД/ВЫХОД/ОШИБКА). При ошибках извлечения
 * (триггер в выделении, больше одного внешнего входа и т. п.) честно
 * сообщает причину и не даёт создать модель.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { blockRegistry } from '@/core/registry/block-registry';
import { extractModel } from '@/core/models/extract';
import { flowToCanvas } from '@/core/project/serialize';
import { useProjectStore } from '@/store/project-store';
import type { ModelContract } from '@/core/project/schema';

function ContractRow({ label, ports }: { label: string; ports: ModelContract['inputs'] }) {
  if (ports.length === 0) return null;
  return (
    <div>
      <div className="mb-1 text-muted">{label}</div>
      <div className="flex flex-wrap gap-1">
        {ports.map((p) => (
          <span key={p.id} className="rounded-full border border-line/70 px-1.5 py-0.5 text-[10px]">
            {p.name} <span className="opacity-60">· {p.type}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function CreateModelDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const project = useProjectStore((s) => s.project);
  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);
  const activeModelId = useProjectStore((s) => s.activeModelId);
  const createModelFromSelection = useProjectStore((s) => s.createModelFromSelection);

  const [name, setName] = useState(`Модель ${(project?.models.length ?? 0) + 1}`);
  const [error, setError] = useState<string | null>(null);

  const selectedCount = nodes.filter((n) => n.selected).length;

  // Предпросмотр контракта: тот же чистый код, что применится при создании.
  const preview = useMemo(() => {
    if (!project) return null;
    const activeDoc = activeModelId
      ? project.models.find((m) => m.id === activeModelId)?.canvas
      : project.canvas;
    if (!activeDoc) return null;
    const doc = flowToCanvas(nodes, edges, activeDoc.id, activeDoc.name);
    return extractModel({
      canvas: doc,
      selectedNodeIds: nodes.filter((n) => n.selected).map((n) => n.id),
      modelName: name,
      getBlock: (id) => blockRegistry.get(id),
      portName: (labelKey, fallback) => t(labelKey, fallback),
    });
  }, [project, nodes, edges, activeModelId, name]);

  const confirm = () => {
    const err = createModelFromSelection(name);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  };

  const contract = preview?.ok ? preview.value.model.contract : null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-abyss/70 p-4" onClick={onClose}>
      <div className="glass-strong w-[380px] rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-bold">{t('canvas.model.dialog.title')}</span>
          <button className="text-muted transition-colors hover:text-ink" onClick={onClose} title={t('common.close')}>
            ✕
          </button>
        </div>

        <div className="mb-2 text-[11px] text-muted">
          {t('canvas.model.dialog.selected', { count: selectedCount })}
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] text-muted">{t('canvas.model.dialog.name')}</span>
          <input
            className="input-dark"
            value={name}
            placeholder={t('canvas.model.dialog.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {preview && !preview.ok && (
          <div className="mb-3 rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-[11.5px] leading-relaxed text-red-200">
            {t(`canvas.model.errors.${preview.error}`)}
          </div>
        )}

        {contract && (
          <div className="mb-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">
              {t('canvas.model.dialog.contract')}
            </div>
            {contract.inputs.length === 0 && contract.outputs.length === 0 && !contract.error ? (
              <div className="text-[11px] text-muted/70">{t('canvas.model.dialog.noContract')}</div>
            ) : (
              <div className="space-y-2 rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-3 text-[11px]">
                <ContractRow label={t('canvas.inspector.model.inputs')} ports={contract.inputs} />
                <ContractRow label={t('canvas.inspector.model.outputs')} ports={contract.outputs} />
                {contract.error && <ContractRow label={t('canvas.inspector.model.error')} ports={[contract.error]} />}
              </div>
            )}
          </div>
        )}

        {error && preview?.ok && (
          <div className="mb-3 rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-[11.5px] text-red-200">
            {t(`canvas.model.errors.${error}`)}
          </div>
        )}

        <p className="mb-4 text-[10.5px] leading-snug text-muted/70">{t('canvas.model.dialog.hint')}</p>

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" disabled={!preview?.ok} onClick={confirm}>
            {t('common.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
