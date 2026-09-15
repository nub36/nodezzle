import { expect, test, type Page } from '@playwright/test';
import { arrangePair, openTools, port } from './helpers';

async function create(page: Page) {
  await page.goto('/#/dashboard');
  await page.getByTestId('onboarding-skip').click();
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('empty-onboarding')).toBeVisible();
}

for (const width of [390, 768, 1024, 1440]) test(`новый пустой экран ${width}: старт доступен и не перекрыт панелями`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: width === 1440 ? 900 : 640 });
  await create(page);
  const welcome = page.getByTestId('empty-onboarding');
  await expect(page.locator('.react-flow__minimap, .react-flow__controls')).toHaveCount(0);
  const canvas = await page.locator('[data-tutorial="canvas"]').boundingBox();
  const box = (await welcome.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
  expect(box.y).toBeGreaterThanOrEqual(canvas!.y);
  expect(box.y + box.height).toBeLessThanOrEqual(canvas!.y + canvas!.height);
  for (const kind of ['telegram', 'web', 'empty']) {
    const button = page.getByTestId(`start-${kind}`);
    await expect(button).toBeInViewport();
    expect(await button.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return [8, r.width / 2, r.width - 8].every((x) => el.contains(document.elementFromPoint(r.x + x, r.y + r.height / 2)));
    })).toBe(true);
  }
  if (width >= 1024) {
    const left = (await page.locator('#canvas-library').boundingBox())!;
    const right = (await page.locator('#canvas-inspector').boundingBox())!;
    expect(box.x).toBeGreaterThan(left.x + left.width);
    expect(box.x + box.width).toBeLessThan(right.x);
    // Одностороннее сворачивание смещает композицию в реальную свободную область.
    await page.getByTestId('panel-toggle-library').click();
    expect((await welcome.boundingBox())!.x).toBeLessThan(box.x);
    await page.getByTestId('panel-toggle-library').click();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({ path: testInfo.outputPath(`canvas-empty-${width}.png`) });
  await page.getByTestId('start-empty').focus();
  await page.keyboard.press('Enter');
  await expect(welcome).toHaveCount(0);
  await expect(page.getByTestId('library-search')).toBeFocused();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
});

test('новые разъёмы: форма ошибки, направления, увеличенная область захвата и настоящее соединение', async ({ page }) => {
  await create(page);
  for (const block of ['core.text', 'data.text_to_number']) {
    await page.getByTestId('library-search').fill(block);
    await page.getByTestId(`library-item-${block}`).click();
  }
  const source = page.getByTestId('canvas-node-core.text');
  const target = page.getByTestId('canvas-node-data.text_to_number');
  await expect(page.locator('.react-flow__minimap')).toBeVisible();
  await expect(page.locator('.react-flow__controls')).toBeVisible();
  await arrangePair(page, source, target);
  const from = port(source, 'output', 'text');
  const to = port(target, 'input', 'value');
  const error = target.locator('[data-port-kind="error"]');
  await expect(to).toHaveAttribute('aria-label', 'Вход: Текст · Текст');
  await expect(from).toHaveAttribute('aria-label', 'Выход: Текст · Текст');
  await expect(error).toHaveCSS('border-radius', '3px');
  expect(await to.evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await from.evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  expect((await target.boundingBox())!.height).toBeLessThanOrEqual(100);
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  // Начало и конец жеста на 2 px СНАРУЖИ видимого маркера, но в расширенной зоне.
  await page.mouse.move(a.x + a.width + 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width + 20, a.y + a.height / 2, { steps: 4 });
  await expect(from).toHaveAttribute('data-port-active', 'true');
  await page.mouse.move(b.x - 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await openTools(page);
  for (const mode of ['reduced', 'off', 'full']) {
    await page.getByTestId('effects-mode').click();
    await expect(page.getByTestId('effects-mode')).toHaveAttribute('data-effects-mode', mode);
    await expect(error).toHaveCSS('border-radius', '3px');
    await expect(error).toHaveAttribute('data-port-direction', 'output');
  }
});

test('журнал убран только из быстрой строки, меню группирует разделы и закрывается снаружи', async ({ page }) => {
  await page.goto('/#/');
  const header = page.getByTestId('site-header');
  await expect(header.locator('.site-secondary-nav').getByRole('link', { name: 'Журнал действий' })).toHaveCount(0);
  const trigger = header.locator('summary:visible');
  await trigger.click();
  const menu = header.locator('[data-site-menu][open]');
  await expect(menu.getByRole('heading', { name: 'Доступно сейчас' })).toBeVisible();
  await expect(menu.getByRole('heading', { name: 'В разработке' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Журнал действий' })).toBeVisible();
  await page.locator('.site-brand').click();
  await expect(menu).toHaveCount(0);
  await trigger.click();
  await menu.getByRole('link', { name: 'Журнал действий' }).click();
  await page.getByTestId('onboarding-skip').click();
  await expect(page).toHaveURL(/dashboard\?section=history/);
  await expect(page.locator('#dashboard-history')).toBeInViewport();
});
