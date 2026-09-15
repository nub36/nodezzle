/** 10B1: контракт условного редактирования. Автосохранение/повторы — не здесь. */
import { z } from 'zod';
import { nodezzleProjectSchema, type NodezzleProject } from '@/core/project/schema';
import { ApiClientError, createJsonClient, type FetchLike } from './server-api';
const revisionSchema = z.string().regex(/^[0-9a-f]{32}$/);
const envelopeSchema = z.object({
  project: nodezzleProjectSchema,
  revision: revisionSchema,
  workspaceId: z.string().min(1),
  updatedAt: z.string().datetime(),
});
export type ServerProjectDocument = z.infer<typeof envelopeSchema>;
export interface ServerProjectApi {
  load(id: string): Promise<ServerProjectDocument>;
  save(document: NodezzleProject, expectedRevision: string): Promise<ServerProjectDocument>;
  restore(id: string, versionId: string, expectedRevision: string): Promise<ServerProjectDocument>;
  remove(id: string, expectedRevision: string): Promise<void>;
}
function revision(value: string): string {
  if (!revisionSchema.safeParse(value).success) throw new ApiClientError(400, 'INVALID_REVISION', 'INVALID_REVISION');
  return value;
}
function invalidResponse(): never { throw new ApiClientError(502, 'INVALID_RESPONSE', 'INVALID_RESPONSE'); }
function envelope(raw: unknown, id: string, previousRevision?: string): ServerProjectDocument {
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success || parsed.data.project.id !== id || parsed.data.revision === previousRevision) invalidResponse();
  return parsed.data;
}
const projectPath = (id: string) => `/api/projects/${encodeURIComponent(id)}`;
export function createServerProjectApi(fetchImpl: FetchLike = fetch): ServerProjectApi {
  const call = createJsonClient((path, init) => fetchImpl(path, { ...init, signal: AbortSignal.timeout(15_000) }));
  return {
    async load(id) { return envelope(await call('GET', projectPath(id)), id); },
    async save(document, expectedRevision) {
      const parsed = nodezzleProjectSchema.safeParse(document);
      if (!parsed.success) throw new ApiClientError(400, 'INVALID_PROJECT', 'INVALID_PROJECT');
      const value = await call('PUT', projectPath(document.id), { document: parsed.data, expectedRevision: revision(expectedRevision) });
      return envelope(value, document.id, expectedRevision);
    },
    async restore(id, versionId, expectedRevision) {
      const value = await call('POST', `${projectPath(id)}/versions/${encodeURIComponent(versionId)}/restore`, { expectedRevision: revision(expectedRevision) });
      return envelope(value, id, expectedRevision);
    },
    async remove(id, expectedRevision) {
      const value = await call('DELETE', projectPath(id), { expectedRevision: revision(expectedRevision) });
      if (!z.object({ ok: z.literal(true) }).safeParse(value).success) invalidResponse();
    },
  };
}
