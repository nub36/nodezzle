import { expect, it } from 'vitest';
import { isEditorPath, plannedSections, primaryLinks, workspaceLinks } from './navigation';
import ru from '@/i18n/locales/ru.json';
it('все запланированные разделы доступны из единого меню и честно отмечены', () => {
  const links = [...primaryLinks, ...workspaceLinks];
  expect(new Set(links.map((l) => l.to)).size).toBe(links.length);
  for (const id of plannedSections) {
    expect(links.find((l) => l.id === id)).toMatchObject({ to: `/workspace/${id}`, planned: true });
    expect(ru.navigation.sections[id].actions.length).toBeGreaterThan(0);
  }
});
it('названия всех пунктов русские, без необъявленных ключей', () => {
  for (const link of [...primaryLinks, ...workspaceLinks]) expect(ru.navigation.links).toHaveProperty(link.id);
});
it('полная шапка не занимает высоту редактора, но остаётся на страницах сайта', () => {
  expect(isEditorPath('/projects/a')).toBe(true);
  expect(isEditorPath('/server-projects/a')).toBe(true);
  expect(isEditorPath('/dashboard')).toBe(false);
  expect(isEditorPath('/workspace/requests')).toBe(false);
  expect(isEditorPath('/academy')).toBe(false);
});
