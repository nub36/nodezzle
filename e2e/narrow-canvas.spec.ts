import { openTools } from './helpers';
import { openResult } from './helpers';
/** 08B: реальные панели редактора, не только ширина страницы Академии. */
import { expect, test, type Page } from '@playwright/test';
import { openLesson, step, completed } from './lesson-helpers';

async function noPageOverflow(page: Page, width: number) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

for (const width of [390, 768]) {
  test(`узкий Canvas ${width}: панели, вставка, свойства, Escape, отладка и F5`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/#/dashboard');
    await page.getByTestId('onboarding-skip').click();
    await page.getByTestId('create-project').click();
    await expect(page.locator('[data-tutorial="library"]')).toBeHidden();
    await expect(page.locator('[data-tutorial="inspector"]')).toBeHidden();
    await expect(page.locator('[data-tutorial="debug"]')).toBeHidden();
    await noPageOverflow(page, width);
    await page.getByTestId('panel-toggle-library').click();
    await expect(page.getByTestId('library-search')).toBeFocused();
    await page.getByTestId('library-search').fill('core.text');
    await page.getByTestId('library-item-core.text').click();
    await expect(page.locator('[data-tutorial="library"]')).toBeHidden();
    const node = page.getByTestId('canvas-node-core.text');
    const box = (await node.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await page.getByTestId('panel-toggle-inspector').click();
    await expect(page.getByTestId('panel-toggle-inspector')).toHaveAttribute('aria-expanded', 'true');
    await page.locator('[data-tutorial="inspector"]').getByLabel('Значение', { exact: true }).fill('Узкий холст: 42');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-tutorial="inspector"]')).toBeHidden();
    await expect(page.getByTestId('panel-toggle-inspector')).toBeFocused();
    await page.getByTestId('panel-toggle-inspector').click();
    await page.locator('[data-tutorial="inspector"]').getByTitle('Закрыть', { exact: true }).click();
    await expect(page.locator('[data-tutorial="inspector"]')).toBeHidden();
    await expect(page.getByTestId('panel-toggle-inspector')).toBeFocused();
    await page.getByTestId('panel-toggle-library').click();
    await page.getByTestId('panel-toggle-inspector').click();
    await expect(page.locator('[data-tutorial="library"]')).toBeHidden();
    await page.getByTestId('panel-toggle-canvas').click();
    await page.getByTestId('toolbar-tools-toggle').click();
    await expect(page.getByTitle('Приблизить')).toBeVisible();
    await openTools(page);
    await page.getByTitle('Приблизить').click();
    await noPageOverflow(page, width);
    await page.getByTestId('toolbar-tools-toggle').click();
    await page.getByTestId('debug-toggle').click();
    await page.getByTestId('run-button').click();
    await openResult(page);
    await page.getByTestId('debug-tab-ports').click();
    await expect(page.getByTestId('debug-node-core.text').getByTestId('output-text')).toHaveText('"Узкий холст: 42"');
    await noPageOverflow(page, width);
    expect((await page.locator('[data-tutorial="canvas"]').boundingBox())!.height).toBeGreaterThan(200);
    await page.reload();
    await expect(page.locator('[data-tutorial="library"]')).toBeHidden();
    await expect(node).toHaveCount(1);
    await node.click();
    await page.getByTestId('panel-toggle-inspector').click();
    await expect(page.locator('[data-tutorial="inspector"]').getByLabel('Значение', { exact: true })).toHaveValue('Узкий холст: 42');
    const position = await page.locator('.react-flow__node').getAttribute('style');
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByTestId('panel-toggle-library')).toBeVisible();
    await expect(page.locator('[data-tutorial="library"]')).toBeVisible();
    await expect(page.locator('[data-tutorial="inspector"]')).toBeVisible();
    expect(await page.locator('.react-flow__node').getAttribute('style')).toBe(position);
  });
}

test('урок знакомства с Canvas на 390px: библиотека, выбор и инспектор без перекрытия панелей', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openLesson(page, 'intro-canvas', ['intro-what']);
  await step(page, 'canvas');
  await page.getByTestId('tutorial-ack').click();
  await step(page, 'library');
  await page.getByTestId('panel-toggle-library').click();
  await expect(page.getByTestId('library-search')).toBeVisible();
  await page.getByTestId('tutorial-ack').click();
  await step(page, 'add-text');
  await page.getByTestId('library-search').fill('core.text');
  await page.getByTestId('library-item-core.text').click();
  await step(page, 'select-text');
  await expect(page.locator('[data-tutorial="library"]')).toBeHidden();
  await page.getByTestId('canvas-node-core.text').click();
  await step(page, 'inspector');
  await page.getByTestId('panel-toggle-inspector').click();
  await expect(page.locator('[data-tutorial="inspector"]').getByLabel('Значение', { exact: true })).toBeVisible();
  // Escape панели не должен прерывать урок.
  let dialogs = 0;
  page.on('dialog', async (dialog) => { dialogs++; await dialog.dismiss(); });
  await page.keyboard.press('Escape');
  expect(dialogs).toBe(0);
  await page.getByTestId('tutorial-ack').click();
  await completed(page, 'intro-canvas');
});
