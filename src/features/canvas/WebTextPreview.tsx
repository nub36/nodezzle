/** Корни Web-деревьев (совместимо с плоскими листьями 09B1). HTML не исполняется. */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/project-store';
import { useExecutionStore } from '@/store/execution-store';
import { executionGraphKey } from '@/lib/execution-graph-key';
import { buildLayoutElement, readWebElement, type LayoutKind, type WebElement } from '@/core/web/layout-element';
import { buildTextElement, readTextElement } from '@/core/web/text-element';
import { isWebLayout, webLayoutRoots } from './web-layout-roots';
import { WebElementView } from './WebElementView';

export function WebTextPreview() {
  const { t } = useTranslation();
  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);
  const project = useProjectStore((s) => s.project);
  const activeModelId = useProjectStore((s) => s.activeModelId);
  const runs = useExecutionStore((s) => s.nodeInfo);
  const resultKey = useExecutionStore((s) => s.nodeInfoGraphKey);
  const running = useExecutionStore((s) => s.running);
  const key = useMemo(
    () => executionGraphKey(nodes, edges, project?.id ?? '', activeModelId, project?.models ?? []),
    [nodes, edges, project, activeModelId],
  );
  const { roots, hasCycle } = useMemo(() => webLayoutRoots(nodes, edges), [nodes, edges]);
  const fresh = !running && resultKey === key;
  return <>
    {hasCycle && <p role="status" className="text-xs text-amber-200">{t('execution.panel.web.layoutCycle')}</p>}
    {roots.map((node) => {
      const layout = isWebLayout(node.data.blockId);
      const connected = edges.some((edge) => edge.target === node.id
        && ['text', 'level', 'children', 'title', 'columns'].includes(edge.targetHandle ?? ''));
      const run = runs[node.id];
      let element: WebElement | null = null;
      if (connected) {
        if (fresh && run?.status === 'success') {
          element = layout ? readWebElement(run.outputs.element) : readTextElement(run.outputs.element);
        }
      } else {
        element = layout
          ? buildLayoutElement(node.data.blockId.slice(4) as LayoutKind, {}, node.data.config)
          : buildTextElement(node.data.blockId === 'web.text' ? 'text' : 'heading', {}, node.data.config);
      }
      const message = connected && fresh && run?.error === 'ERR_WEB_TREE'
        ? 'errors.ERR_WEB_TREE'
        : connected ? 'execution.panel.web.awaitRun' : 'execution.panel.web.invalidElement';
      return <div key={node.id} data-testid={layout ? 'web-preview-layout-element' : 'web-preview-text-element'} data-node-id={node.id} className="min-w-0 break-words">
        {!element ? <p role="status" className="text-xs text-amber-200">{t(message)}</p>
          : <WebElementView element={element} />}
      </div>;
    })}
  </>;
}
