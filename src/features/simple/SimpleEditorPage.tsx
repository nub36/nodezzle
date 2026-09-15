import { useEffect, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/project-store';
import { useExecutionStore } from '@/store/execution-store';
import { messageCommand } from '@/core/telegram/message-command';
import { blockRegistry } from '@/core/registry/block-registry';
import type { NodezzleFlowNode } from '@/core/project/serialize';
import type { ProjectKind } from '@/core/project/schema';
import { executionGraphKey } from '@/lib/execution-graph-key';
import { estimateNodeSize, findFreePosition, occupiedRects } from '@/lib/node-placement';
import { translateError } from '@/lib/utils';
import { useLocalProjectLifecycle } from '@/features/projects/useLocalProjectLifecycle';
import { EditorModeSwitch } from '@/features/projects/EditorModeSwitch';
import { PhonePreview } from '@/features/canvas/PhonePreview';
import { WebPreview } from '@/features/canvas/WebPreview';
import { BlockIcon } from '@/components/BlockIcon';
import { canEditSimply, isEvent, simpleConnectionAllowed, simpleIssues, simpleLabelKey, starterBlocks, SIMPLE_IDS } from './simple-presentation';

export function SimpleStartPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const create = async (kind: ProjectKind) => {
    if (busy) return;
    setBusy(true); setError(false);
    try { const p = await useProjectStore.getState().createProject(kind); navigate(`/build/${p.id}`); }
    catch { setError(true); setBusy(false); }
  };
  return <main className="simple-start">
    <Link to="/dashboard">← {t('navigation.links.projects')}</Link>
    <p className="simple-eyebrow">{t('simple.mode')}</p><h1>{t('simple.chooseGoal')}</h1>
    <p>{t('simple.oneProject')}</p>
    <div className="simple-goals">{(['telegram', 'web', 'empty'] as const).map((kind) => <button className="btn-ghost" key={kind} disabled={busy} data-testid={`simple-create-${kind}`} onClick={() => void create(kind)}>
      <strong>{t(`dashboard.kinds.${kind}`)}</strong><span>{t(`simple.goals.${kind}`)}</span>
    </button>)}</div>
    {error && <p role="alert">{t('simple.saveFailed')}</p>}
  </main>;
}

export function SimpleEditorPage() {
  const { projectId = '' } = useParams();
  useLocalProjectLifecycle(projectId);
  const s = useProjectStore();
  const run = useExecutionStore();
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<ReturnType<typeof simpleIssues>>([]);
  const [preferred, setPreferred] = useState<{ target: string; source: string } | null>(null);
  const key = s.project ? executionGraphKey(s.nodes, s.edges, s.project.id, s.activeModelId, s.project.models) : '';
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const state = useProjectStore.getState().saveState;
    return (state === 'error' || state === 'saving') && currentLocation.pathname !== nextLocation.pathname;
  });
  useEffect(() => {
    if (blocker.state === 'blocked' && s.saveState === 'saved') blocker.proceed();
  }, [blocker, s.saveState]);
  useEffect(() => { setErrors([]); }, [key]);
  const name = (node: NodezzleFlowNode) => node.data.label || t(SIMPLE_IDS.some((id) => id === node.data.blockId) ? simpleLabelKey(node.data.blockId) : blockRegistry.get(node.data.blockId)?.labelKey ?? 'simple.unknown');
  if (s.loading) return <main className="simple-start">{t('common.loading')}</main>;
  if (!s.project || s.project.id !== projectId) return <main className="simple-start"><h1>{t('simple.notFound')}</h1><Link to="/dashboard">{t('navigation.links.projects')}</Link></main>;
  const project = s.project;
  const editable = canEditSimply(project, s.nodes, s.edges, s.groups);
  const web = project.kind === 'web' || s.nodes.some((n) => n.data.blockId === 'web.text');
  const general = project.kind === 'empty' && !s.nodes.some((n) => n.data.blockId.startsWith('telegram.') || n.data.blockId.startsWith('web.'));
  const fresh = run.nodeInfoGraphKey === key && run.nodeInfoRunId !== null;
  const add = (id: string, after?: string) => {
    if (!editable || run.running || !SIMPLE_IDS.some((b) => b === id)) return;
    const pos = findFreePosition({ x: after ? 450 : 100, y: 100 }, estimateNodeSize(blockRegistry.get(id)), occupiedRects(s.nodes, (b) => blockRegistry.get(b)), { x: 0, y: 0, width: 1100, height: 1400 });
    const target = s.addNode(id, pos);
    if (target && after) setPreferred({ target, source: after });
  };
  const check = async () => {
    if (!editable || run.running) return;
    const issues = simpleIssues(s.nodes, s.edges);
    setErrors(issues);
    if (issues.length) return;
    run.setPayload({ source: web ? 'web' : 'telegram', telegramEvent: 'message', text: message, command: messageCommand(message) ?? '', userId: 42, chatId: 1000, webJson: '{}' });
    await run.run();
  };
  return <main className="simple-editor" data-testid="simple-editor" data-project-id={project.id}>
    <header className="simple-header">
      <Link to="/dashboard" className="btn-ghost !px-3" aria-label={t('navigation.links.projects')}>←</Link>
      <div><span className="simple-eyebrow">{t('simple.mode')}</span><h1>{project.name}</h1></div>
      <span className="simple-save" role="status">{t(`simple.save.${s.saveState}`)}</span>
      <EditorModeSwitch simple />
    </header>
    {s.saveState === 'error' && <div className="simple-warning" role="alert">{t('simple.saveFailed')} <button onClick={() => void s.saveNow()}>{t('simple.retrySave')}</button></div>}
    {blocker.state === 'blocked' && <div className="simple-warning" role="alert">{t('simple.stayToSave')} <button onClick={() => blocker.reset()}>{t('common.close')}</button></div>}
    {!editable && <div className="simple-warning" role="status">{t('simple.readOnly')}</div>}
    <div className="simple-workspace">
      <section className="simple-board" aria-label={t('simple.scheme')}>
        <div className="simple-board-title"><div><h2>{t(general ? 'simple.generalGoal' : web ? 'simple.webGoal' : 'simple.botGoal')}</h2><p>{t('simple.boardHint')}</p></div>
          {editable && <div className="simple-history"><button disabled={!s.past.length || run.running} onClick={s.undo} data-testid="simple-undo" aria-label={t('canvas.toolbar.undo')}>↶</button><button disabled={!s.future.length || run.running} onClick={s.redo} data-testid="simple-redo" aria-label={t('canvas.toolbar.redo')}>↷</button></div>}
        </div>
        {editable && <details className="simple-library" open={s.nodes.length === 0}>
          <summary>{t(s.nodes.length ? 'simple.addMore' : 'simple.startWith')}</summary>
          {(['events', 'actions', 'values'] as const).map((group) => {
            const blocks = starterBlocks(project.kind).filter((d) => (isEvent(d.id) ? 'events' : d.id === 'core.text' ? 'values' : 'actions') === group);
            return blocks.length ? <div className="simple-library-group" key={group}><h3>{t(`simple.groups.${group}`)}</h3>{blocks.map((d) => <button disabled={run.running} key={d.id} data-testid={`simple-add-${d.id}`} onClick={() => add(d.id)}><BlockIcon icon={d.ui?.icon} />{t(simpleLabelKey(d.id))}<span aria-hidden="true">＋</span></button>)}</div> : null;
          })}
          {project.kind === 'telegram' && <details><summary>{t('simple.extraValues')}</summary><button disabled={run.running} onClick={() => add('core.text')} data-testid="simple-add-core.text">{t(simpleLabelKey('core.text'))}</button></details>}
          <p>{t('simple.moreInPro')}</p>
        </details>}
        <div className="simple-nodes">{s.nodes.map((node, index) => <article className="simple-node" data-testid={`simple-node-${node.data.blockId}`} data-node-id={node.id} key={node.id}>
          <header><span className="simple-node-icon"><BlockIcon icon={blockRegistry.get(node.data.blockId)?.ui?.icon} /></span><h3>{name(node)}</h3><small>{index + 1}</small></header>
          <div className="simple-connections">{s.edges.filter((e) => e.target === node.id).map((edge) => {
            const from = s.nodes.find((n) => n.id === edge.source);
            const def = blockRegistry.get(node.data.blockId);
            const input = def?.inputs.find((p) => p.id === edge.targetHandle);
            return <p key={edge.id} data-testid="simple-connection" data-source-handle={edge.sourceHandle} data-target-handle={edge.targetHandle}>
              <span aria-hidden="true">↳ </span>{from ? name(from) : t('simple.unknown')} → {editable ? t(edge.targetHandle === 'chat_id' ? 'simple.recipientPort' : 'simple.textPort') : input ? t(input.labelKey) : edge.targetHandle}
            </p>;
          })}</div>
          {editable ? <fieldset disabled={run.running}>
            {isEvent(node.data.blockId) && <>
              <p>{t(node.data.blockId === 'telegram.command' ? 'simple.commandHint' : 'simple.eventHint')}</p>
              {node.data.blockId === 'telegram.command' && <label>{t('simple.command')}<input className="input-dark" value={String(node.data.config.command ?? '')} onChange={(e) => s.setNodeConfig(node.id, 'command', e.target.value)} /></label>}
              <div className="simple-next"><span>{t('simple.whatNext')}</span><button data-testid="simple-next-reply" onClick={() => add('telegram.send_message', node.id)}>{t(simpleLabelKey('telegram.send_message'))} →</button></div>
            </>}
            {node.data.blockId === 'telegram.send_message' && <ReplyFields node={node} preferred={preferred?.target === node.id ? preferred.source : undefined} name={name} />}
            {['core.text', 'web.text'].includes(node.data.blockId) && <label>{t('simple.text')}<textarea aria-label={t('simple.text')} className="input-dark" value={String(node.data.config[node.data.blockId === 'core.text' ? 'value' : 'text'] ?? '')} onChange={(e) => s.setNodeConfig(node.id, node.data.blockId === 'core.text' ? 'value' : 'text', e.target.value)} /></label>}
          </fieldset> : <details><summary>{t('simple.viewData')}</summary><pre>{JSON.stringify(node.data.config, null, 2)}</pre></details>}
        </article>)}</div>
        {!editable && <details className="simple-raw"><summary>{t('simple.allData')}</summary><pre>{JSON.stringify({ nodes: s.nodes, edges: s.edges, models: project.models, groups: s.groups, variables: project.variables }, null, 2)}</pre></details>}
      </section>
      <aside className="simple-test" aria-label={t('simple.testArea')}>
        <h2>{t(general ? 'simple.checkScheme' : web ? 'simple.checkWeb' : 'simple.checkBot')}</h2><p>{t('simple.testOnly')}</p>
        {editable && !general ? <>
          {!web && <label>{t('simple.testMessage')}<input className="input-dark" value={message} placeholder={t('simple.testPlaceholder')} onChange={(e) => setMessage(e.target.value)} disabled={run.running} /></label>}
          <button className="btn-primary" data-testid="simple-check" disabled={!s.nodes.length || run.running || (!web && !message.trim())} onClick={() => void check()}>{t(general ? 'simple.checkScheme' : web ? 'simple.checkWeb' : 'simple.checkBot')}</button>
          {run.running && <button onClick={run.stop}>{t('canvas.toolbar.stop')}</button>}
          {!!errors.length && <ul role="alert">{errors.map((e, i) => { const node = s.nodes.find((n) => n.id === e.nodeId); return <li key={i}>{node ? `${name(node)}: ` : ''}{t(e.key)}</li>; })}</ul>}
          {fresh && !errors.length && <div role="status" data-testid="simple-result">{run.status === 'error' ? t('simple.runError') : run.status === 'waiting' || (!web && !run.outbox.length) ? t('simple.noReply') : t('simple.resultReady')}
            {run.status === 'error' && <p>{Object.values(run.nodeInfo).filter((n) => n.error).map((n) => translateError(n.error)).join('; ')}</p>}
          </div>}
          {fresh && !errors.length ? web ? <WebPreview /> : <PhonePreview /> : <div className="simple-test-empty">{t(run.nodeInfoRunId ? 'simple.checkAgain' : 'simple.testHint')}</div>}
        </> : <p>{t(general ? 'simple.generalHint' : 'simple.testInPro')}</p>}
      </aside>
    </div>
  </main>;
}

function ReplyFields({ node, preferred, name }: { node: NodezzleFlowNode; preferred?: string; name: (n: NodezzleFlowNode) => string }) {
  const { t } = useTranslation();
  const s = useProjectStore();
  const events = s.nodes.filter((n) => isEvent(n.data.blockId));
  const [choice, setChoice] = useState(preferred ?? '');
  const chat = s.edges.find((e) => e.target === node.id && e.targetHandle === 'chat_id');
  const text = s.edges.find((e) => e.target === node.id && e.targetHandle === 'text');
  const textSource = s.nodes.find((n) => n.id === text?.source);
  const connect = () => {
    const connection = { source: choice, sourceHandle: 'chat_id', target: node.id, targetHandle: 'chat_id' };
    if (chat || !simpleConnectionAllowed(s.nodes, connection)) return;
    // Нельзя смешать автора одного события с текстом другого.
    if (textSource && isEvent(textSource.data.blockId) && textSource.id !== choice) return;
    s.handleConnect(connection);
  };
  return <>
    {chat ? <p className="simple-recipient">{t('simple.recipientLinked')} <button onClick={() => s.deleteEdge(chat.id)}>{t('simple.unlink')}</button></p> : <label>{t('simple.recipient')}
      <select aria-label={t('simple.recipient')} className="input-dark" value={choice} onChange={(e) => setChoice(e.target.value)}><option value="">{t('simple.chooseEvent')}</option>{events.filter((n) => !textSource || !isEvent(textSource.data.blockId) || textSource.id === n.id).map((n, i) => <option key={n.id} value={n.id}>{name(n)} · {i + 1}</option>)}</select>
      <button className="btn-ghost" data-testid="simple-connect" disabled={!events.some((n) => n.id === choice)} onClick={connect}>{t('simple.connectEvent')}</button>
      <small>{t('simple.recipientHint')}</small>
    </label>}
    {text ? <div className="simple-text-source"><p>{t('simple.wiredText', { source: textSource ? name(textSource) : t('simple.unknown') })}</p><button onClick={() => s.deleteEdge(text.id)}>{t('simple.useOwnText')}</button></div>
      : <label>{t('simple.replyText')}<textarea aria-label={t('simple.replyText')} className="input-dark" data-testid="simple-reply-text" value={String(node.data.config.replyText ?? '')} placeholder={t('simple.replyPlaceholder')} onChange={(e) => s.setNodeConfig(node.id, 'replyText', e.target.value)} /><small>{t('simple.fixedTextHint')}</small></label>}
  </>;
}
