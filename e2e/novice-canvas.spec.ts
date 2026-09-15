import { expect, test, type Page } from '@playwright/test';
async function create(page: Page) {
  await page.goto('/#/dashboard');
  await page.getByTestId('onboarding-skip').click();
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('empty-onboarding')).toBeVisible();
}
test('новичок: закрытые категории, поиск внутри, клавиатура, независимые панели и F5', async ({ page }) => {
  await create(page);
  const categories = page.locator('[data-testid^="library-category-"]');
  expect(await categories.count()).toBeGreaterThan(2);
  for (const item of await categories.all()) await expect(item).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('debug-tab-simulator')).toHaveCount(0);
  await expect(page.getByTestId('run-button')).toBeDisabled();
  await page.getByTestId('library-search').fill('telegram.send_message');
  await expect(page.getByTestId('library-item-telegram.send_message')).toBeVisible();
  await page.getByTestId('library-search').fill('');
  await expect(page.getByTestId('library-category-telegram')).toHaveAttribute('aria-expanded', 'false');
  await page.getByTestId('library-category-telegram').click();
  await expect(page.getByTestId('library-item-telegram.message_received')).toBeVisible();
  await page.getByTestId('panel-toggle-library').click();
  await expect(page.locator('#canvas-library')).toBeHidden();
  await page.getByTestId('panel-toggle-inspector').click();
  await expect(page.locator('#canvas-inspector')).toBeHidden();
  await page.reload();
  await expect(page.locator('#canvas-library')).toBeHidden();
  await expect(page.locator('#canvas-inspector')).toBeHidden();
  await page.getByTestId('panel-toggle-library').click();
  await expect(page.getByTestId('library-category-telegram')).toHaveAttribute('aria-expanded', 'true');
  await page.getByTestId('library-item-telegram.message_received').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('canvas-node-telegram.message_received')).toBeVisible();
  await expect(page.getByTestId('empty-onboarding')).toHaveCount(0);
});
test('пустой старт не добавляет скрытых деталей и не навязывает сценарий', async ({ page }) => {
  await create(page);
  await page.getByTestId('start-empty').click();
  await expect(page.getByTestId('empty-onboarding')).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await expect(page.getByTestId('library-search')).toBeFocused();
});
test('первый Telegram: начало → ответ → реальные связи → запуск → чат; undo снимает успех', async ({ page }) => {
  await create(page);
  await page.getByTestId('start-telegram').click();
  await expect(page.getByTestId('empty-onboarding')).toHaveCount(0);
  await expect(page.getByTestId('novice-guide')).toContainText('Действие');
  await page.getByTestId('novice-add-action').click();
  // Незавершённая схема запускается тем же движком, но не получает значок готовности.
  await page.getByTestId('run-button').click();
  await expect(page.getByText('Готово! Схема работает', { exact: true })).toHaveCount(0);
  await page.getByTestId('novice-connect').click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await expect(page.getByText('Готово! Схема работает', { exact: true })).toHaveCount(0);
  await page.getByTestId('run-button').click();
  await expect(page.getByTestId('debug-tab-chat')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('novice-guide')).toContainText('Готово! Схема работает');
  await expect(page.locator('.canvas-debug-body')).toContainText('привет');
  await expect(page.getByTestId('novice-guide')).toContainText('тестовом чате');
  await page.getByTitle('Отменить (Ctrl+Z)').click();
  await expect(page.getByText('Готово! Схема работает', { exact: true })).toHaveCount(0);
});
test('первый Web: выбранный тип, настоящая страница, изменение текста отменяет прежний успех', async ({ page }) => {
  await create(page);
  await page.getByTestId('start-web').click();
  await page.getByTestId('novice-add-action').click();
  await page.getByTestId('novice-connect').click();
  await page.getByTestId('run-button').click();
  await expect(page.getByTestId('debug-tab-web')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('web-preview-text-element')).toHaveText('Привет! Это моя первая страница.');
  await expect(page.getByTestId('novice-guide')).toContainText('Готово! Схема работает');
  await page.getByTestId('canvas-node-core.text').click();
  await page.getByTestId('panel-toggle-inspector').click();
  await page.locator('#canvas-inspector').getByLabel('Значение', { exact: true }).fill('Новый текст');
  await expect(page.getByText('Готово! Схема работает', { exact: true })).toHaveCount(0);
  await page.getByTestId('run-button').click();
  await expect(page.getByTestId('web-preview-text-element')).toHaveText('Новый текст');
});
for (const width of [390, 768, 1440]) test(`адаптивность ${width}: первый путь и доступные инструменты`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await create(page);
  await page.getByTestId('start-telegram').click();
  await page.getByTestId('novice-add-action').click();
  await page.getByTestId('novice-connect').click();
  await page.getByTestId('run-button').click();
  await expect(page.getByTestId('novice-guide')).toContainText('Готово! Схема работает');
  await page.getByTestId('toolbar-tools-toggle').click();
  const buttons = page.locator('.canvas-toolbar button:visible');
  for (const button of await buttons.all()) {
    expect(await button.getAttribute('title')).toBeTruthy();
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(36);
    expect(box.height).toBeGreaterThanOrEqual(36);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  expect((await page.locator('[data-tutorial="canvas"]').boundingBox())!.height).toBeGreaterThan(200);
  if (width === 1440) await page.screenshot({ path: '/home/user/11-editor.png' });
  await page.getByRole('button', { name: 'Расширенный вид', exact: true }).click();
  await expect(page.getByTestId('novice-guide')).toHaveCount(0);
  if (width < 1280) {
    await page.getByTestId('toolbar-tools-toggle').click();
    await expect(page.getByTestId('effects-mode')).toBeHidden();
    await page.getByTestId('toolbar-tools-toggle').click();
    await expect(page.getByTestId('effects-mode')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Подсказки новичку', exact: true }).click();
  await expect(page.getByTestId('novice-guide')).toBeVisible();
});
