import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/store/project-store';
import { useExecutionStore } from '@/store/execution-store';

/** Не копирует документ и не переходит при неудачном сохранении. */
export function EditorModeSwitch({ simple = false }: { simple?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const project = useProjectStore((s) => s.project);
  const saveState = useProjectStore((s) => s.saveState);
  const server = useProjectStore((s) => s.serverSession);
  const running = useExecutionStore((s) => s.running);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!project || server || (!simple && project.meta.tutorial)) return null;
  const switchMode = async () => {
    if (busy || running) return;
    setBusy(true); setFailed(false);
    const store = useProjectStore.getState();
    if (store.activeModelId) store.closeModel();
    await store.saveNow();
    if (useProjectStore.getState().saveState === 'error') { setFailed(true); setBusy(false); return; }
    navigate(`/${simple ? 'projects' : 'build'}/${project.id}`);
  };
  return <span className="editor-mode-switch">
    <button title={t(simple ? 'simple.toPro' : 'simple.mode')} data-testid="editor-mode-switch" className="btn-ghost !py-1.5 text-xs" disabled={busy || running} onClick={() => void switchMode()}>{t(simple ? 'simple.toPro' : 'simple.mode')}</button>
    {failed && saveState === 'error' && <span role="alert">{t('simple.saveFailed')}</span>}
  </span>;
}
