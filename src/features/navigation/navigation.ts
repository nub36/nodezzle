/** Навигация отделена от доступности серверных операций: оболочка не обещает реализацию. */
export const plannedSections = ['requests', 'team', 'templates', 'versions', 'publication', 'secrets', 'settings'] as const;
export type PlannedSection = typeof plannedSections[number];
export const primaryLinks = [
  { id: 'home', to: '/' }, { id: 'projects', to: '/dashboard' },
  { id: 'learn', to: '/academy' }, { id: 'requests', to: '/workspace/requests', planned: true },
];
export const workspaceLinks = [
  { id: 'catalog', to: '/academy/reference' },
  { id: 'telegram', to: '/dashboard?section=telegram' },
  { id: 'history', to: '/dashboard?section=history' },
  ...plannedSections.filter((id) => id !== 'requests').map((id) => ({ id, to: `/workspace/${id}`, planned: true })),
  { id: 'glossary', to: '/academy/glossary' },
];
export const isEditorPath = (path: string) => /^\/(server-projects|projects)\/[^/]+$/.test(path);
