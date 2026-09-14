/** Подготовка только предпосылок; целевой урок проходится действиями в браузере. */
import { expect, type Page } from '@playwright/test';

export async function openLesson(page: Page, lessonId: string, prerequisites: string[] = []) {
  if (prerequisites.includes(lessonId)) throw new Error(`Целевой урок ${lessonId} нельзя завершать в фикстуре`);
  await page.addInitScript((extraPrerequisites) => {
    if (sessionStorage.getItem('practice-initialized')) return;
    const done = { status: 'completed', stepIndex: 9, startedAt: 1, completedAt: 2 };
    localStorage.setItem('nodezzle-academy-v1', JSON.stringify({
      lessons: Object.fromEntries(extraPrerequisites.map((id) => [id, done])),
      onboarding: { done: true, choice: 'explore' },
    }));
    sessionStorage.setItem('practice-initialized', '1');
  }, prerequisites);
  await page.goto('/#/academy');
  await page.getByTestId(`lesson-card-${lessonId}`).click();
  await page.getByTestId('lesson-start').click();
}

/** Практические уроки старших уровней начинаются с информационного about. */
export async function startLesson(page: Page, lessonId: string, prerequisites: string[] = []) {
  await openLesson(page, lessonId, ['intro-what', 'intro-canvas', 'basics-ports', 'basics-chain', ...prerequisites]);
  await step(page, 'about');
  await page.getByTestId('tutorial-ack').click();
}

export async function step(page: Page, id: string) {
  await expect(page.getByTestId('tutorial-card')).toHaveAttribute('data-step-id', id);
}

export async function add(page: Page, id: string) {
  await page.getByTestId('library-search').fill(id);
  await page.getByTestId(`library-item-${id}`).click();
  const node = page.getByTestId(`canvas-node-${id}`);
  await expect(node).toBeVisible();
  return node;
}

export async function completed(page: Page, lessonId: string) {
  await expect(page.getByTestId('tutorial-finished')).toBeVisible();
  await page.getByTestId('tutorial-to-academy').click();
  await expect(page.getByTestId(`lesson-card-${lessonId}`)).toContainText('100%');
  await page.reload();
  await expect(page.getByTestId(`lesson-card-${lessonId}`)).toContainText('100%');
}

