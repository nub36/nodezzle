/** Подсказка над текущей схемой, а не отдельный учебный/runtime-движок. */
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/project-store';
import { useExecutionStore } from '@/store/execution-store';
import { useUiStore } from '@/store/ui-store';
import { useTutorialStore } from '@/store/tutorial-store';
import { executionGraphKey } from '@/lib/execution-graph-key';
import { novicePath } from './novice-model';
import type { DndPayload } from './library-utils';

export function NoviceGuide({ onInsert }: { onInsert: (payload: DndPayload) => void }) {
  const { t } = useTranslation();
  const { project, nodes, edges, activeModelId, handleConnect } = useProjectStore();
  const { status, nodeInfoGraphKey, nodeInfo, outbox } = useExecutionStore();
  const novice = useUiStore((s) => s.noviceMode);
  const teaching = useTutorialStore((s) => s.active);
  const path = novicePath(nodes, edges);
  if (!novice || teaching || activeModelId || !project || nodes.length === 0 || nodes.length > 2 || !path.start) return null;
  const fresh = nodeInfoGraphKey === executionGraphKey(nodes, edges, project.id, activeModelId, project.models);
  const success = fresh && status === 'success' && path.step === 3 && !!path.action &&
    nodeInfo[path.action.id]?.status === 'success' && (path.telegram ? outbox.length > 0 : !!nodeInfo[path.action.id]?.outputs?.element);
  const connect = () => {
    // Повторный расчёт исключает дубликаты даже при быстром повторном клике.
    const state = useProjectStore.getState();
    const current = novicePath(state.nodes, state.edges);
    if (current.safe && current.start && current.action) for (const [sourceHandle, targetHandle] of current.missing) {
      handleConnect({ source: current.start.id, target: current.action.id, sourceHandle, targetHandle });
    }
  };
  return <section data-testid="novice-guide" className="novice-guide shrink-0 border-b border-line/60 px-4 py-2 text-xs">
    <ol className="flex flex-wrap gap-x-3 gap-y-1 text-muted" aria-label={t('novice.progress')}>
      {['begin', 'action', 'check', 'done'].map((step, i) => <li key={step} aria-current={i === (success ? 3 : path.step < 2 ? path.step : 2) ? 'step' : undefined}>
        {i + 1}. {t(`novice.steps.${step}`)}{i < 3 && <span aria-hidden="true" className="ml-3 opacity-40">→</span>}
      </li>)}
    </ol>
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <p role="status" className={success ? 'text-emerald-200' : 'text-muted'}>{t(success ? 'novice.success' : !path.action ? `novice.addHint.${path.telegram ? 'telegram' : 'web'}` : path.missing.length ? `novice.connectHint.${path.telegram ? 'telegram' : 'web'}` : 'novice.runHint')}</p>
      {!path.action && <button className="btn-ghost !py-1 text-xs" data-testid="novice-add-action" onClick={() => onInsert({ blockId: path.telegram ? 'telegram.send_message' : 'web.text' })}>{t('novice.addAction')}</button>}
      {path.safe && path.missing.length > 0 && <button className="btn-ghost !py-1 text-xs" data-testid="novice-connect" onClick={connect}>{t('novice.connect')}</button>}
      {success && <span className="text-muted">{t(path.telegram ? 'novice.testOnly' : 'novice.webOnly')}</span>}
    </div>
  </section>;
}
