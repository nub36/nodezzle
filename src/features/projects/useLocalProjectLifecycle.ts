import { useEffect } from 'react';
import { useProjectStore } from '@/store/project-store';
import { useExecutionStore } from '@/store/execution-store';

/** Общая загрузка/сохранение локального документа. Сервером владеет ServerSession. */
export function useLocalProjectLifecycle(projectId: string, serverManaged = false) {
  const loadById = useProjectStore((s) => s.loadById);
  useEffect(() => {
    if (!serverManaged) void loadById(projectId);
  }, [projectId, loadById, serverManaged]);
  useEffect(() => {
    if (serverManaged) return;
    const flush = () => useProjectStore.getState().flushSave();
    window.addEventListener('beforeunload', flush);
    return () => { window.removeEventListener('beforeunload', flush); flush(); };
  }, [projectId, serverManaged]);
  useEffect(() => {
    useExecutionStore.getState().stop();
    useExecutionStore.getState().reset();
  }, [projectId]);
}
