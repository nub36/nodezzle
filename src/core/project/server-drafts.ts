/** Независимые журналы открытых серверных редакторов. Не локальные проекты. */
import { z } from 'zod';
import { nodezzleProjectSchema } from './schema';
import { uid } from '@/lib/id';
const schema = z.object({
  version: z.literal(1), userId: z.string().min(1), workspaceId: z.string().min(1),
  revision: z.string().regex(/^[0-9a-f]{32}$/), document: nodezzleProjectSchema,
  updatedAt: z.number(),
});
export type ServerDraft = z.infer<typeof schema>;
export type DraftEntry = { key: string; draft: ServerDraft };
const prefix = 'nodezzle.server-draft.';
export class ServerDrafts {
  constructor(private storage: Storage) {}
  newKey() { return prefix + uid(); }
  put(key: string, value: ServerDraft) {
    const clean = schema.parse(value);
    if (!key.startsWith(prefix) || clean.document.meta.tutorial) throw new Error('INVALID_DRAFT');
    this.storage.setItem(key, JSON.stringify(clean));
  }
  remove(key: string) { if (key.startsWith(prefix)) this.storage.removeItem(key); }
  list(userId: string, projectId: string, workspaceId?: string): DraftEntry[] {
    const result: DraftEntry[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key?.startsWith(prefix)) continue;
      try {
        const parsed = schema.safeParse(JSON.parse(this.storage.getItem(key) ?? 'null'));
        if (parsed.success && parsed.data.userId === userId && (workspaceId === undefined || parsed.data.workspaceId === workspaceId) &&
          parsed.data.document.id === projectId && !parsed.data.document.meta.tutorial) result.push({ key, draft: parsed.data });
      } catch { /* Повреждённые записи не стираем и не применяем. */ }
    }
    return result.sort((a, b) => b.draft.updatedAt - a.draft.updatedAt);
  }
}
