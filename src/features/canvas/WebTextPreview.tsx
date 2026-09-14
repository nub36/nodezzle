/** Первый плоский слой рендеринга. Произвольный HTML никогда не вставляется. */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/project-store';
import { useExecutionStore } from '@/store/execution-store';
import { executionGraphKey } from '@/lib/execution-graph-key';
import { buildTextElement, readTextElement } from '@/core/web/text-element';

export function WebTextPreview() {
  const { t } = useTranslation();
  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);
  const project = useProjectStore((s) => s.project);
  const activeModelId = useProjectStore((s) => s.activeModelId);
  const runs = useExecutionStore((s) => s.nodeInfo);
  const resultKey = useExecutionStore((s) => s.nodeInfoGraphKey);
  const running = useExecutionStore((s) => s.running);
  const key = useMemo(() => executionGraphKey(nodes, edges, project?.id ?? '', activeModelId, project?.models ?? []), [nodes, edges, project, activeModelId]);
  return nodes.filter((n) => n.data.blockId === 'web.text' || n.data.blockId === 'web.heading').map((node) => {
    const connected = edges.some((edge) => edge.target === node.id && (edge.targetHandle === 'text' || edge.targetHandle === 'level'));
    const run = runs[node.id];
    const element = connected
      ? (!running && resultKey === key && run?.status === 'success' ? readTextElement(run.outputs.element) : null)
      : buildTextElement(node.data.blockId === 'web.text' ? 'text' : 'heading', {}, node.data.config);
    const Heading = `h${element?.kind === 'heading' ? element.level : 2}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    return <div key={node.id} data-testid="web-preview-text-element" data-node-id={node.id} className="min-w-0 break-words">
      {!element ? <p role="status" className="text-xs text-amber-200">{t(connected ? 'execution.panel.web.awaitRun' : 'execution.panel.web.invalidElement')}</p>
        : element.kind === 'heading' ? <Heading className="whitespace-pre-wrap font-bold text-ink" style={{ fontSize: `${1.75 - (element.level - 1) * 0.15}rem` }}>{element.text}</Heading>
        : <p className="whitespace-pre-wrap text-sm text-ink">{element.text}</p>}
    </div>;
  });
}
