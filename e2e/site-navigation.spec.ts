import { test, expect } from '@playwright/test';
for (const width of [390, 768, 1440]) test(`шапка ${width}: разделы, будущие действия, меню и Escape`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const writes: string[] = [];
  page.on('request', (req) => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method())) writes.push(req.url()); });
  await page.goto('/#/');
  const header = page.getByTestId('site-header');
  await expect(header).toBeVisible();
  const menu = header.locator('summary:visible');
  await menu.click();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await menu.click();
  await header.locator('[data-site-menu][open]').getByRole('link', { name: 'Обращения' }).click();
  await expect(page.getByRole('heading', { name: 'Обращения', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Кнопки ниже недоступны');
  await expect(page.getByTestId('workspace-section').locator('button')).toHaveCount(3);
  for (const button of await page.getByTestId('workspace-section').locator('button').all()) await expect(button).toBeDisabled();
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Обращения', exact: true })).toBeVisible();
  if (width === 1440) await page.screenshot({ path: '/home/user/site-design.png', fullPage: true });
});
test('все подготовленные разделы открываются, неизвестный адрес не рисует выдуманную функцию', async ({ page }) => {
  for (const id of ['requests', 'team', 'templates', 'versions', 'publication', 'secrets', 'settings']) {
    await page.goto(`/#/workspace/${id}`);
    await expect(page.getByTestId('workspace-section')).toBeVisible();
    await expect(page.getByRole('status')).toContainText('данные не создаются');
  }
  await page.goto('/#/workspace/unknown');
  await expect(page).toHaveURL(/dashboard/);
});
test('быстрый переход ведёт к существующему аккаунту; редактор сохраняет компактную навигацию', async ({ page }) => {
  await page.goto('/#/dashboard?section=account');
  await page.getByTestId('onboarding-skip').click();
  await expect(page.locator('#dashboard-account')).toBeInViewport();
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('site-header')).toHaveCount(0);
  await expect(page.getByTestId('run-button')).toBeVisible();
  const menu = page.locator('.canvas-section-nav summary');
  await menu.click();
  await page.locator('[data-site-menu][open]').getByRole('link', { name: 'Настройки' }).click();
  await expect(page.getByRole('heading', { name: 'Настройки', exact: true })).toBeVisible();
});
