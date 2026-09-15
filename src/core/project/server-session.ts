/** Последовательная запись, контроль контекста и восстановление. Без React/store. */
import type { NodezzleProject } from './schema';
import type { ServerProjectApi, ServerProjectDocument } from '@/lib/server-project-api';
import { ApiClientError } from '@/lib/server-api';
import { ServerDrafts, type ServerDraft } from './server-drafts';
export type ServerSaveStatus = 'saved' | 'dirty' | 'saving' | 'paused';
export interface ServerSessionState {
  status: ServerSaveStatus; error: string; backupError: boolean; checking: boolean;
  document: NodezzleProject; revision: string; remote: ServerProjectDocument | null;
}
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const stable = (value: unknown): string => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
export const sameContent = (a: NodezzleProject, b: NodezzleProject) => {
  const clean = (p: NodezzleProject) => ({ ...p, meta: { ...p.meta, updatedAt: 0 }, models: p.models.map((m) => ({ ...m, updatedAt: 0 })) });
  return stable(clean(a)) === stable(clean(b));
};
export const sameDocument = (a: NodezzleProject, b: NodezzleProject) => stable(a) === stable(b);
export class ServerSession {
  private state: ServerSessionState;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private editNumber = 0;
  private acknowledged = 0;
  private sending = false;
  private closed = false;
  readonly draftKey: string;
  constructor(readonly userId: string, readonly initial: ServerProjectDocument,
    private api: Pick<ServerProjectApi, 'load' | 'save'>, private verifyUser: () => Promise<string>,
    private drafts: ServerDrafts) {
    if (initial.project.meta.tutorial) throw new Error('TUTORIAL_PROJECT');
    this.state = { status: 'saved', error: '', backupError: false, checking: false, document: copy(initial.project), revision: initial.revision, remote: null };
    this.draftKey = drafts.newKey();
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(patch: Partial<ServerSessionState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach((l) => l()); }
  private stopTimer() { clearTimeout(this.timer); this.timer = undefined; }
  private schedule() { this.stopTimer(); this.timer = setTimeout(() => { void this.flush(); }, 900); }
  private async identity() {
    if (await this.verifyUser() !== this.userId) throw new ApiClientError(401, 'SESSION_CHANGED', 'SESSION_CHANGED');
  }
  private checkpoint() {
    try {
      if (this.editNumber === this.acknowledged) this.drafts.remove(this.draftKey);
      else this.drafts.put(this.draftKey, { version: 1, userId: this.userId, workspaceId: this.initial.workspaceId,
        revision: this.state.revision, document: this.state.document, updatedAt: Date.now() });
      this.set({ backupError: false });
    } catch { this.set({ backupError: true }); }
  }
  edit(document: NodezzleProject) {
    if (this.closed || document.id !== this.initial.project.id || document.meta.tutorial) return;
    if (sameContent(document, this.state.document)) return;
    this.editNumber++;
    this.set({ document: copy(document), status: this.state.status === 'paused' ? 'paused' : this.sending ? 'saving' : 'dirty' });
    this.checkpoint();
    if (this.state.status !== 'paused' && !this.sending) this.schedule();
  }
  recover(draft: ServerDraft) {
    if (draft.userId !== this.userId || draft.workspaceId !== this.initial.workspaceId || draft.document.id !== this.initial.project.id || draft.document.meta.tutorial) throw new Error('INVALID_DRAFT');
    this.pause('recovered');
    this.editNumber++;
    this.set({ document: copy(draft.document), revision: draft.revision });
    this.checkpoint();
  }
  pause(reason = 'context') {
    if (this.closed) return;
    ++this.generation; this.stopTimer();
    this.set({ status: 'paused', error: reason, checking: false, remote: null });
    this.checkpoint();
  }
  private fail(error: unknown) {
    const reason = error instanceof ApiClientError ? error.status === 409 ? 'conflict' : error.status === 401 ? 'auth' : error.status === 404 ? 'missing' : 'network' : 'network';
    this.set({ status: 'paused', error: reason, remote: null });
    this.checkpoint();
  }
  async flush() {
    this.stopTimer();
    if (this.closed || this.sending || this.state.status === 'paused' || this.editNumber === this.acknowledged) return;
    const generation = this.generation;
    const current = () => !this.closed && this.generation === generation;
    const number = this.editNumber, document = copy(this.state.document), revision = this.state.revision;
    this.sending = true; this.set({ status: 'saving', error: '' });
    try {
      await this.identity();
      if (!current()) return;
      const saved = await this.api.save(document, revision, this.userId);
      if (!current()) return;
      if (saved.workspaceId !== this.initial.workspaceId) throw new Error('WORKSPACE_CHANGED');
      this.acknowledged = number;
      this.set({ revision: saved.revision, status: this.editNumber === number ? 'saved' : 'dirty' });
      this.checkpoint();
    } catch (error) { if (current()) this.fail(error); }
    finally {
      this.sending = false;
      if (current() && this.state.status === 'dirty') this.schedule();
    }
  }
  /** Только чтение. Никакого автоматического «GET → новая ревизия → PUT». */
  async inspect() {
    if (this.closed || this.sending || this.state.checking) return;
    this.pause(this.state.error || 'context');
    const generation = this.generation;
    const current = () => !this.closed && generation === this.generation;
    this.set({ checking: true });
    try {
      await this.identity();
      if (!current()) return;
      const remote = await this.api.load(this.initial.project.id);
      await this.identity();
      if (!current()) return;
      if (remote.workspaceId !== this.initial.workspaceId || remote.project.meta.tutorial) throw new Error('INVALID_CONTEXT');
      if (sameDocument(remote.project, this.state.document)) {
        this.acknowledged = this.editNumber;
        this.set({ revision: remote.revision, status: 'saved', error: '', remote: null });
        this.checkpoint();
      } else this.set({ remote, error: remote.revision === this.state.revision ? 'ready' : 'conflict' });
    } catch (error) { if (current()) this.fail(error); }
    finally { if (current()) this.set({ checking: false }); }
  }
  /** Пользователь явно выбрал сохранение вместо ПРОСМОТРЕННОЙ версии. CAS остаётся. */
  async keepMine() {
    if (this.closed || !this.state.remote || this.sending || this.state.checking) return;
    this.editNumber++;
    this.set({ revision: this.state.remote.revision, remote: null, status: 'dirty', error: '' });
    this.checkpoint();
    await this.flush();
  }
  acceptRemote(): NodezzleProject | null {
    if (this.closed || !this.state.remote || this.sending || this.state.checking) return null;
    const remote = this.state.remote;
    this.editNumber++; this.acknowledged = this.editNumber;
    this.set({ document: copy(remote.project), revision: remote.revision, remote: null, status: 'saved', error: '' });
    this.checkpoint();
    return copy(remote.project);
  }
  hasPending() { return this.editNumber !== this.acknowledged || this.sending; }
  dispose() {
    if (this.closed) return;
    this.checkpoint(); this.closed = true; ++this.generation; this.stopTimer(); this.listeners.clear();
  }
}
