/**
 * E2E визуального жизненного цикла соединения (0.5.28).
 *
 * Сценарии:
 *  1. Перетаскивание OUTPUT → совместимый INPUT: источник активен,
 *     цель совместима, при наведении — «готов к подключению», после
 *     отпускания — ребро, вспышка подтверждения и импульс линии.
 *  2. Несовместимый INPUT: помечен как несовместимый, ребро НЕ
 *     создаётся.
 *  3. Урок Академии «Цепочка»: подсвечены требуемые порты, после
 *     соединения шаг урока завершается одновременно со вспышкой.
 *
 * Все селекторы — data-атрибуты (без поиска по классам/тексту).
 * Запуск: `npm run test:e2e` (нужен браузер: `npx playwright install chromium`).
 */

import { expect, test, type Page } from '@playwright/test';
import { arrangePair } from './helpers';

async function skipOnboardingIfShown(page: Page): Promise<void> {
  const skip = page.getByTestId('onboarding-skip');
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) {
    await skip.click();
  }
}

async function newProject(page: Page): Promise<void> {
  await page.goto('/#/dashboard');
  await skipOnboardingIfShown(page);
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('library-search')).toBeVisible({ timeout: 15_000 });
}

/** Координаты центра локатора. */
async function centerOf(locator: ReturnType<Page['locator']>): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('нет координат элемента');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Перетащить соединение с выходного порта на входной. */
async function dragConnection(
  page: Page,
  sourceHandle: ReturnType<Page['locator']>,
): Promise<void> {
  const from = await centerOf(sourceHandle);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Короткий сдвиг, чтобы жест соединения начался.
  await page.mouse.move(from.x + 14, from.y + 6, { steps: 4 });
}

test.describe('Соединение деталей: визуальный жизненный цикл', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test('OUTPUT → совместимый INPUT: готовность, ребро, вспышка, импульс', async ({ page }) => {
    await newProject(page);

    // Добавляем «Текст» и «Число из текста».
    await page.getByTestId('library-search').fill('текст');
    await page.getByTestId('library-item-core.text').first().click();
    await page.getByTestId('library-search').fill('data.text_to_number');
    await page.getByTestId('library-item-data.text_to_number').first().click();
    await page.getByTestId('library-search').fill('');

    const source = page.getByTestId('canvas-node-core.text');
    const target = page.getByTestId('canvas-node-data.text_to_number');
    await expect(source).toBeVisible();
    await expect(target).toBeVisible();

    await arrangePair(page, source, target);
    const sourceHandle = source.locator('.nzz-handle[data-port-id="text"][data-port-direction="output"]');
    const targetHandle = target.locator('.nzz-handle[data-port-id="value"][data-port-direction="input"]');

    await dragConnection(page, sourceHandle);

    // CONNECTION DRAG: исходный порт активен, узел помечен.
    await expect(sourceHandle).toHaveAttribute('data-port-active', 'true');
    await expect(source).toHaveAttribute('data-connection-state', 'drag-source');
    // Совместимый вход помечен как совместимый.
    await expect(targetHandle).toHaveAttribute('data-port-compatible', 'true');

    // Наведение на цель — состояние «готов к подключению».
    const to = await centerOf(targetHandle);
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await expect(targetHandle).toHaveAttribute('data-port-ready', 'true');

    // Отпускаем: соединение создано.
    await page.mouse.up();

    // Ребро появилось (ровно одно).
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    // Вспышка подтверждения на обоих блоках + импульс по новой линии.
    await expect(source).toHaveAttribute('data-connection-state', 'connect-success');
    await expect(target).toHaveAttribute('data-connection-state', 'connect-success');
    await expect(page.locator('.react-flow__edge.nzz-edge-pulse')).toHaveCount(1);

    // Вспышка короткая: через секунду постоянного свечения уже нет.
    await page.waitForTimeout(1000);
    await expect(source).not.toHaveAttribute('data-connection-state', 'connect-success');
  });

  test('несовместимый INPUT: помечен и соединение не создаётся', async ({ page }) => {
    await newProject(page);

    // «Число» (выход типа Число) и «Число из текста» (вход типа Текст).
    await page.getByTestId('library-search').fill('число');
    await page.getByTestId('library-item-core.number').first().click();
    await page.getByTestId('library-search').fill('data.text_to_number');
    await page.getByTestId('library-item-data.text_to_number').first().click();
    await page.getByTestId('library-search').fill('');

    const source = page.getByTestId('canvas-node-core.number');
    const target = page.getByTestId('canvas-node-data.text_to_number');
    await arrangePair(page, source, target);
    const sourceHandle = source.locator('.nzz-handle[data-port-id="value"][data-port-direction="output"]');
    const targetHandle = target.locator('.nzz-handle[data-port-id="value"][data-port-direction="input"]');

    await dragConnection(page, sourceHandle);

    // Несовместимый вход помечен; состояние готовности не появляется.
    await expect(targetHandle).toHaveAttribute('data-port-compatible', 'false');
    const to = await centerOf(targetHandle);
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await expect(targetHandle).not.toHaveAttribute('data-port-ready');

    await page.mouse.up();

    // Ребро НЕ создано, вспышки нет.
    await expect(page.locator('.react-flow__edge')).toHaveCount(0);
    await expect(source).not.toHaveAttribute('data-connection-state', 'connect-success');
  });

  test('Академия: шаг «соединить» подсвечивает порты и завершается после соединения', async ({ page }) => {
    // Разблокируем урок «Цепочка» завершёнными предшественниками.
    await page.addInitScript(() => {
      const done = { status: 'completed', stepIndex: 9, startedAt: 1, completedAt: 2 };
      localStorage.setItem(
        'nodezzle-academy-v1',
        JSON.stringify({
          lessons: { 'intro-what': done, 'intro-canvas': done, 'basics-ports': done },
          onboarding: { done: true, choice: 'telegram' },
        }),
      );
    });

    await page.goto('/#/academy');
    await page.getByTestId('lesson-card-basics-chain').click();
    await page.getByTestId('lesson-start').click();
    await expect(page.getByTestId('tutorial-card')).toBeVisible();

    // Шаг 1/4 — добавить «Сообщение получено».
    await page.getByTestId('library-search').fill('telegram.message_received');
    await page.getByTestId('library-item-telegram.message_received').first().click();
    // Шаг 2/4 — добавить «Запись в журнал».
    await expect(page.getByTestId('tutorial-card')).toHaveAttribute('data-step-id', 'add-log');
    await page.getByTestId('library-search').fill('debug.log');
    await page.getByTestId('library-item-debug.log').first().click();

    // Шаг 3/4 — соединение: требуемые порты подсвечены Академией.
    await expect(page.getByTestId('tutorial-card')).toHaveAttribute('data-step-id', 'connect');
    const msgNode = page.getByTestId('canvas-node-telegram.message_received');
    const logNode = page.getByTestId('canvas-node-debug.log');
    await arrangePair(page, msgNode, logNode);
    const msgOut = msgNode.locator('.nzz-handle[data-port-id="text"][data-port-direction="output"]');
    const logIn = logNode.locator('.nzz-handle[data-port-id="value"][data-port-direction="input"]');
    await expect(msgOut).toHaveClass(/port-academy/);
    await expect(logIn).toHaveClass(/port-academy/);

    // Соединяем: визуальное подтверждение + шаг урока завершаются.
    await dragConnection(page, msgOut);
    const to = await centerOf(logIn);
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();

    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    await expect(msgNode).toHaveAttribute('data-connection-state', 'connect-success');
    // Шаг «соединить» завершён — урок перешёл к следующему шагу.
    await expect(page.getByTestId('tutorial-card')).not.toHaveAttribute('data-step-id', 'connect');
  });
});
