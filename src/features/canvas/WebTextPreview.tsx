/** Корни Web-деревьев (совместимо с плоскими листьями 09B1). HTML не исполняется. */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/project-store';
import { useExecutionStore } from '@/store/execution-store';
import { executionGraphKey } from '@/lib/execution-graph-key';
import { buildLayoutElement, readWebElement, type LayoutKind, type WebElement } from '@/core/web/layout-element';
import { buildUrlElement, readUrlElement } from '@/core/web/url-element';
import { isWebField, buildFieldElement, readFieldElement } from '@/core/web/field-element';
import { buildTextElement, readTextElement } from '@/core/web/text-element';
import { isWebLayout, isWebUrlBlock, webLayoutRoots } from './web-layout-roots';
import { WebElementView } from './WebElementView';

export function useWebPreviewElements() {
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
  const items = roots.map((node) => {
      const field = isWebField(node.data.blockId);
      const urlBlock = isWebUrlBlock(node.data.blockId);
      const layout = isWebLayout(node.data.blockId);
      const connected = edges.some((edge) => edge.target === node.id
        && ['text', 'level', 'children', 'title', 'columns', 'src', 'caption', 'href', 'label', 'placeholder'].includes(edge.targetHandle ?? ''));
      const run = runs[node.id];
      let element: WebElement | null = null;
      if (connected) {
        if (fresh && run?.status === 'success') {
          element = layout ? readWebElement(run.outputs.element)
            : field ? readFieldElement(run.outputs.element)
            : urlBlock ? readUrlElement(run.outputs.element) : readTextElement(run.outputs.element);
        }
      } else {
        element = layout
          ? buildLayoutElement(node.data.blockId.slice(4) as LayoutKind, {}, node.data.config)
          : field ? buildFieldElement(node.data.blockId === 'web.input' ? 'input' : 'textarea', {}, node.data.config)
          : urlBlock ? buildUrlElement(node.data.blockId === 'web.image' ? 'image' : 'link', {}, node.data.config)
          : buildTextElement(node.data.blockId === 'web.text' ? 'text' : 'heading', {}, node.data.config);
      }
      const message = connected && fresh && run?.error === 'ERR_WEB_TREE'
        ? 'errors.ERR_WEB_TREE'
        : field && (!connected || (fresh && run?.error === 'ERR_WEB_FIELD')) ? 'errors.ERR_WEB_FIELD'
        : urlBlock && (!connected || (fresh && run?.error === 'ERR_WEB_URL_ELEMENT')) ? 'errors.ERR_WEB_URL_ELEMENT'
        : connected ? 'execution.panel.web.awaitRun' : 'execution.panel.web.invalidElement';
      return { nodeId: node.id, element, message, testId: layout ? 'web-preview-layout-element' : field ? 'web-preview-field-element' : urlBlock ? 'web-preview-url-element' : 'web-preview-text-element' };
  });
  return { items, hasCycle, context: JSON.stringify([project?.id, activeModelId]) };
}

export function WebTextPreview({ preview }: { preview: ReturnType<typeof useWebPreviewElements> }) {
  const { t } = useTranslation();
  return <>
    {preview.hasCycle && <p role="status" className="text-xs text-amber-200">{t('execution.panel.web.layoutCycle')}</p>}
    {preview.items.map((item) => <div key={JSON.stringify([preview.context, item.nodeId])} data-testid={item.testId} data-node-id={item.nodeId} className="min-w-0 break-words">
      {!item.element ? <p role="status" className="text-xs text-amber-200">{t(item.message)}</p>
        : <WebElementView element={item.element} />}
    </div>)}
  </>;
}
