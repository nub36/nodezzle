/** 10A: чтение и создание новых копий. Нет PUT/DELETE/публикации. */
import { z } from 'zod';
import { nodezzleProjectSchema, projectKindSchema, type NodezzleProject } from '@/core/project/schema';
import { ApiClientError, createJsonClient, createServerApi, type FetchLike } from './server-api';
const id = z.string().min(1);
const userSchema = z.object({ id, email: z.string().min(1), name: z.string().min(1) });
const workspacesSchema = z.object({ workspaces: z.array(z.object({ id, name: z.string().min(1) })) });
const listSchema = z.object({ projects: z.array(z.object({ id, name: z.string().min(1), kind: projectKindSchema, updatedAt: z.string().datetime() })) });
const documentSchema = z.object({ project: nodezzleProjectSchema, updatedAt: z.string().datetime() });
export type AccountUser = z.infer<typeof userSchema>;
export type ServerProjectSummary = z.infer<typeof listSchema>['projects'][number];
export interface ProjectApi {
  me(): Promise<AccountUser>;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, name: string): Promise<void>;
  logout(): Promise<void>;
  workspaces(): Promise<z.infer<typeof workspacesSchema>['workspaces']>;
  list(workspaceId: string): Promise<ServerProjectSummary[]>;
  get(projectId: string): Promise<NodezzleProject>;
  create(workspaceId: string, document: NodezzleProject): Promise<NodezzleProject>;
}
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ApiClientError(502, 'INVALID_RESPONSE', 'INVALID_RESPONSE');
  return result.data;
}
export function createProjectApi(fetchImpl: FetchLike = fetch): ProjectApi {
  // Ограничиваем ожидание, но timeout POST не доказывает отсутствие записи на сервере.
  const timedFetch: FetchLike = (path, init) => fetchImpl(path, { ...init, signal: AbortSignal.timeout(15_000) });
  const call = createJsonClient(timedFetch);
  const auth = createServerApi(timedFetch);
  return {
    login: auth.login, register: auth.register,
    async me() { return parse(z.object({ user: userSchema }), await call('GET', '/api/auth/me')).user; },
    async logout() { parse(z.object({ ok: z.literal(true) }), await call('POST', '/api/auth/logout')); },
    async workspaces() { return parse(workspacesSchema, await call('GET', '/api/workspaces')).workspaces; },
    async list(workspaceId) {
      return parse(listSchema, await call('GET', `/api/workspaces/${encodeURIComponent(workspaceId)}/projects`)).projects;
    },
    async get(projectId) {
      const value = parse(documentSchema, await call('GET', `/api/projects/${encodeURIComponent(projectId)}`));
      if (value.project.id !== projectId) throw new ApiClientError(502, 'INVALID_RESPONSE', 'INVALID_RESPONSE');
      return value.project;
    },
    async create(workspaceId, document) {
      const clean = parse(nodezzleProjectSchema, document);
      const value = parse(documentSchema, await call('POST', '/api/projects', { workspaceId, document: clean }));
      if (value.project.id !== clean.id) throw new ApiClientError(502, 'INVALID_RESPONSE', 'INVALID_RESPONSE');
      return value.project;
    },
  };
}
