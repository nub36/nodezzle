/**
 * E2E критического пути Академии: РЕАЛЬНЫЙ клик пользователя по детали
 * на холсте должен завершать шаг урока.
 *
 * Запуск: `npm run test:e2e` (нужен браузер: `npx playwright install chromium`).
 * Все селекторы — стабильные data-testid, текст интерфейса русский.
 */

import { expect, test, type Page } from '@playwright/test';

async function skipOnboardingIfShown(page: Page): Promise<void> {
  const skip = page.getByTestId('onboarding-skip');
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) {
    await skip.click();
  }
}

async function openLesson(page: Page, lessonId: string): Promise<void> {
  await page.goto('/#/academy');
  await page.getByTestId(`lesson-card-${lessonId}`).click();
  await page.getByTestId('lesson-start').click();
  await expect(page.getByTestId('tutorial-card')).toBeVisible();
}

test.describe('Академия: критический путь обучения', () => {
  test.beforeEach(async ({ page }) => {
    // Чистое состояние обучения и проекта на каждый тест.
    await page.addInitScript(() => {
      localStorage.clear();
    });
  });

  test('регрессия: клик по «Текст» завершает шаг 4/5 и урок проходит до конца', async ({ page }) => {
    await page.goto('/#/dashboard');
    await skipOnboardingIfShown(page);
    await openLesson(page, 'intro-canvas');

    // Шаг 1/5 — «Это холст» (информация).
    await expect(page.getByTestId('tutorial-card')).toHaveAttribute('data-step-id', 'canvas');
    await page.getByTestId('tutorial-ack').click();

    // Шаг 2/5 — «Библиотека деталей».
    await expect(page.getByTestId('tutorial-card')).toHaveAttribute('data-step-id', 'library');
    await page.getByTestId('tutorial-ack').click();

    // Шаг 3/5 — добавить деталь: ищем «Текст» в библиотеке и вставляем.
    await expect(page.getByTestId('tutorial-card')).toHaveAttribute('data-step-id', 'add-text');
    await page.getByTestId('library-search').fill('текст');
    await page.getByTestId('library-item-core.text').first().click();
    await expect(page.getByTestId('canvas-node-core.text')).toBeVisible();

    // Шаг 4/5 появился автоматически (состав схемы проверен).
    await expect(page.getByTestId('tutorial-card')).toHaveAttribute('data-step-id', 'select-text');

    // РЕАЛЬНЫЙ КЛИК ПО ДЕТАЛИ НА ХОЛСТЕ — именно он зависал до исправления.
    await page.getByTestId('canvas-node-core.text').first().click();

    // Шаг 5/5 — «Инспектор» (информация).
    await expect(page.getByTestId('tutorial-card')).toHaveAttribute('data-step-id', 'inspector');
    await page.getByTestId('tutorial-ack').click();

    // Урок завершён, прогресс виден.
    await expect(page.getByTestId('tutorial-finished')).toBeVisible();

    await page.getByTestId('tutorial-to-academy').click();
    const card = page.getByTestId('lesson-card-intro-canvas');
    await expect(card).toBeVisible();
    await expect(card).toContainText('100%');
  });

  test('клик по ДРУГОЙ детали шаг не завершает', async ({ page }) => {
    await page.goto('/#/dashboard');
    await skipOnboardingIfShown(page);
    await openLesson(page, 'intro-canvas');

    // Быстро доходим до шага выбора детали.
    await page.getByTestId('tutorial-ack').click(); // canvas
    await page.getByTestId('tutorial-ack').click(); // library

    // Добавляем две детали: «Число» и «Текст».
    await page.getByTestId('library-search').fill('число');
    await page.getByTestId('library-item-core.number').first().click();
    await page.getByTestId('library-search').fill('текст');
    await page.getByTestId('library-item-core.text').first().click();
    await expect(page.getByTestId('canvas-node-core.text')).toBeVisible();
    await expect(page.getByTestId('tutorial-card')).toHaveAttribute('data-step-id', 'select-text');

    // Клик по «Числу» — шаг остаётся на месте.
    await page.getByTestId('canvas-node-core.number').first().click();
    await expect(page.getByTestId('tutorial-card')).toHaveAttribute('data-step-id', 'select-text');

    // Клик по «Тексту» — шаг завершается.
    await page.getByTestId('canvas-node-core.text').first().click();
    await expect(page.getByTestId('tutorial-card')).toHaveAttribute('data-step-id', 'inspector');
  });

  test('кнопка «Проверить шаг» повторно проверяет состояние (фолбэк)', async ({ page }) => {
    await page.goto('/#/dashboard');
    await skipOnboardingIfShown(page);
    await openLesson(page, 'intro-canvas');
    await page.getByTestId('tutorial-ack').click();
    await page.getByTestId('tutorial-ack').click();

    await page.getByTestId('library-search').fill('текст');
    await page.getByTestId('library-item-core.text').first().click();
    await expect(page.getByTestId('tutorial-card')).toHaveAttribute('data-step-id', 'select-text');
    await expect(page.getByTestId('tutorial-recheck')).toBeVisible();
    await page.getByTestId('tutorial-recheck').click();
    // Состояние ещё не соответствует шагу — остаёмся на нём же.
    await expect(page.getByTestId('tutorial-card')).toHaveAttribute('data-step-id', 'select-text');
  });

  test('F5 посреди урока: прогресс восстанавливается на том же шаге', async ({ page }) => {
    await page.goto('/#/dashboard');
    await skipOnboardingIfShown(page);
    await openLesson(page, 'intro-canvas');
    await page.getByTestId('tutorial-ack').click(); // шаг 1 → 2
    await expect(page.getByTestId('tutorial-card')).toHaveAttribute('data-step-id', 'library');

    await page.reload();
    // Урок продолжает идти со второго шага (прогресс сохранён).
    await expect(page.getByTestId('tutorial-card')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('tutorial-card')).toHaveAttribute('data-step-id', 'library');
  });
});
