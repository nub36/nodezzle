/**
 * Маршруты проектов: серверное хранение документов проекта.
 *
 * Правило безопасности: сервер никогда не доверяет разрешениям клиента —
 * доступ проверяется по членству в рабочем пространстве, документ
 * валидируется тем же форматом (`nodezzleProjectSchema`), что и
 * во фронтенде.
 */

import { tryParseProject } from '../../../src/core/project/schema.ts';
import { badRequest, conflict, notFound, unauthorized, validationFailed } from '../errors.ts';
import { validateForPublish } from '../publication/validate.ts';

const VERSION_LABEL_MAX = 120;
import { readJsonBody, sendJson } from '../http.ts';
import type { Router } from '../router.ts';
import type { ProjectStore } from '../projects/store.ts';
import type { VersionStore } from '../projects/versions.ts';
import { currentUser, type AuthDeps } from './auth.ts';
import type { WorkspaceStore } from '../workspaces/store.ts';

export interface ProjectDeps extends AuthDeps {
  workspaces: WorkspaceStore;
  projects: ProjectStore;
  versions: VersionStore;
}

/** Достаёт документ из тела и валидирует форматом проекта. */
function parseDocument(body: Record<string, unknown>) {
  const raw = body.document;
  const document = tryParseProject(raw);
  if (!document) throw badRequest('Документ проекта не соответствует формату NodezzleProject');
  return document;
}

export function registerProjectRoutes(router: Router, deps: ProjectDeps): void {
  router.get('/api/workspaces/:wsId/projects', (ctx) => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    if (!deps.workspaces.isMember(ctx.params.wsId, user.id)) throw notFound('Рабочее пространство не найдено');
    sendJson(ctx.res, 200, { projects: deps.projects.listInWorkspace(ctx.params.wsId) });
  });

  router.post('/api/projects', async (ctx) => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    const body = await readJsonBody(ctx.req, deps.config.maxBodyBytes);
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : '';
    if (!deps.workspaces.isMember(workspaceId, user.id)) throw notFound('Рабочее пространство не найдено');
    const document = parseDocument(body);
    if (deps.projects.exists(document.id)) throw conflict('Проект с таким идентификатором уже существует');
    const created = deps.projects.create(workspaceId, document);
    sendJson(ctx.res, 201, { project: created.document, updatedAt: created.updatedAt });
  });

  router.get('/api/projects/:id', (ctx) => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    const row = deps.projects.get(ctx.params.id);
    if (!row || !deps.workspaces.isMember(row.workspaceId, user.id)) throw notFound('Проект не найден');
    sendJson(ctx.res, 200, { project: row.document, updatedAt: row.updatedAt });
  });

  router.put('/api/projects/:id', async (ctx) => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    const existing = deps.projects.get(ctx.params.id);
    if (!existing || !deps.workspaces.isMember(existing.workspaceId, user.id)) throw notFound('Проект не найден');
    const body = await readJsonBody(ctx.req, deps.config.maxBodyBytes);
    const document = parseDocument(body);
    if (document.id !== ctx.params.id) throw badRequest('Идентификатор документа не совпадает с адресом проекта');
    deps.projects.update(ctx.params.id, document);
    const fresh = deps.projects.get(ctx.params.id);
    sendJson(ctx.res, 200, { project: fresh!.document, updatedAt: fresh!.updatedAt });
  });

  router.delete('/api/projects/:id', (ctx) => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    const row = deps.projects.get(ctx.params.id);
    if (!row || !deps.workspaces.isMember(row.workspaceId, user.id)) throw notFound('Проект не найден');
    deps.projects.delete(ctx.params.id);
    sendJson(ctx.res, 200, { ok: true });
  });

  // ── Версии (снапшоты черновика) ────────────────────────────────
  router.post('/api/projects/:id/versions', async (ctx) => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    const row = deps.projects.get(ctx.params.id);
    if (!row || !deps.workspaces.isMember(row.workspaceId, user.id)) throw notFound('Проект не найден');
    const body = await readJsonBody(ctx.req, deps.config.maxBodyBytes);
    const label = typeof body.label === 'string' && body.label.trim() !== ''
      ? body.label.trim().slice(0, VERSION_LABEL_MAX)
      : `Версия от ${new Date().toLocaleString('ru-RU')}`;
    const version = deps.versions.create(ctx.params.id, row.document, label);
    sendJson(ctx.res, 201, { version });
  });

  router.get('/api/projects/:id/versions', (ctx) => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    const row = deps.projects.get(ctx.params.id);
    if (!row || !deps.workspaces.isMember(row.workspaceId, user.id)) throw notFound('Проект не найден');
    sendJson(ctx.res, 200, { versions: deps.versions.list(ctx.params.id) });
  });

  router.get('/api/projects/:id/versions/:versionId', (ctx) => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    const row = deps.projects.get(ctx.params.id);
    if (!row || !deps.workspaces.isMember(row.workspaceId, user.id)) throw notFound('Проект не найден');
    const snapshot = deps.versions.get(ctx.params.id, ctx.params.versionId);
    if (!snapshot) throw notFound('Версия не найдена');
    sendJson(ctx.res, 200, { project: snapshot });
  });

  router.post('/api/projects/:id/versions/:versionId/restore', (ctx) => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    const row = deps.projects.get(ctx.params.id);
    if (!row || !deps.workspaces.isMember(row.workspaceId, user.id)) throw notFound('Проект не найден');
    const snapshot = deps.versions.get(ctx.params.id, ctx.params.versionId);
    if (!snapshot) throw notFound('Версия не найдена');
    // Восстановление перезаписывает черновик; сама версия остаётся.
    deps.projects.update(ctx.params.id, snapshot);
    sendJson(ctx.res, 200, { project: snapshot });
  });

  // ── Публикация: серверная валидация → неизменяемая LIVE-версия ──
  router.post('/api/projects/:id/publish', async (ctx) => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    const row = deps.projects.get(ctx.params.id);
    if (!row || !deps.workspaces.isMember(row.workspaceId, user.id)) throw notFound('Проект не найден');
    const issues = validateForPublish(row.document);
    if (issues.length > 0) {
      throw validationFailed('Схема не прошла проверку перед публикацией', issues);
    }
    const body = await readJsonBody(ctx.req, deps.config.maxBodyBytes);
    const label = typeof body.label === 'string' && body.label.trim() !== ''
      ? body.label.trim().slice(0, VERSION_LABEL_MAX)
      : `Публикация от ${new Date().toLocaleString('ru-RU')}`;
    // Одна публикация на проект: прежняя LIVE уходит в архив.
    deps.versions.archiveLive(ctx.params.id);
    const version = deps.versions.create(ctx.params.id, row.document, label, 'LIVE');
    sendJson(ctx.res, 201, { version });
  });

  router.get('/api/projects/:id/live', (ctx) => {
    const user = currentUser(ctx, deps);
    if (!user) throw unauthorized();
    const row = deps.projects.get(ctx.params.id);
    if (!row || !deps.workspaces.isMember(row.workspaceId, user.id)) throw notFound('Проект не найден');
    const live = deps.versions.findLive(ctx.params.id);
    if (!live) throw notFound('Проект ещё не опубликован');
    sendJson(ctx.res, 200, { version: live, project: deps.versions.get(ctx.params.id, live.id) });
  });
}
