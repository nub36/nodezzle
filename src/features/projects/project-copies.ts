/** Копии не связывают адаптеры и не перезаписывают оригинал. */
import { tryParseProject, type NodezzleProject } from '@/core/project/schema';
import type { ProjectStorage } from '@/core/project/storage';
import type { ProjectApi } from '@/lib/project-api';
import { uid } from '@/lib/id';
export class ProjectCopyError extends Error {
  constructor(readonly code: 'INVALID_PROJECT' | 'TUTORIAL_PROJECT' | 'LOCAL_READ' | 'LOCAL_WRITE' | 'STALE_OPERATION') { super(code); }
}
export function newProjectCopy(raw: unknown, newId = uid(), now = Date.now()): NodezzleProject {
  const source = tryParseProject(raw);
  if (!source || !newId || newId === source.id) throw new ProjectCopyError('INVALID_PROJECT');
  if (source.meta.tutorial) throw new ProjectCopyError('TUTORIAL_PROJECT');
  // Полная JSON-копия: z.unknown внутри config/переменных тоже не разделяет ссылки.
  return { ...JSON.parse(JSON.stringify(source)), id: newId, meta: { createdAt: now, updatedAt: now } };
}
function assertCurrent(isCurrent: () => boolean) {
  if (!isCurrent()) throw new ProjectCopyError('STALE_OPERATION');
}
export async function uploadProjectCopy(api: Pick<ProjectApi, 'create'>, storage: ProjectStorage, workspaceId: string, localId: string, isCurrent: () => boolean): Promise<NodezzleProject> {
  let source: NodezzleProject | null;
  try { source = await storage.get(localId); } catch { throw new ProjectCopyError('LOCAL_READ'); }
  if (!source) throw new ProjectCopyError('LOCAL_READ');
  const copy = newProjectCopy(source);
  assertCurrent(isCurrent);
  return api.create(workspaceId, copy);
}
export async function restoreProjectCopy(api: Pick<ProjectApi, 'get'>, storage: ProjectStorage, serverId: string, isCurrent: () => boolean): Promise<NodezzleProject> {
  const source = await api.get(serverId);
  assertCurrent(isCurrent);
  if (source.id !== serverId) throw new ProjectCopyError('INVALID_PROJECT');
  const copy = newProjectCopy(source);
  try {
    if (await storage.get(copy.id)) throw new Error('collision');
    assertCurrent(isCurrent);
    await storage.save(copy);
  } catch (error) {
    if (error instanceof ProjectCopyError) throw error;
    throw new ProjectCopyError('LOCAL_WRITE');
  }
  return copy;
}
