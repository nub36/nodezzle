import { expect, test, type Page } from '@playwright/test';
import { arrangePair, connectPorts, port } from './helpers';
const config = (page: Page, label: string) => page.locator('[data-tutorial="inspector"]').getByLabel(label, { exact: true });
async function create(page: Page) {
  await page.goto('/#/dashboard');
  await page.getByTestId('onboarding-skip').click();
  await page.getByTestId('create-project').click();
  await page.locator('[data-tutorial="library"]').getByRole('button', { name: 'Все', exact: true }).click();
}
async function add(page: Page, type: string) {
  await page.getByTestId('library-search').fill(type);
  await page.getByTestId(`library-item-${type}`).click();
  return page.getByTestId(`canvas-node-${type}`).last();
}
const openers = (page: Page) => page.getByRole('button', { name: /^Открыть окно:/ });

test('диалог: фокус, Escape, изоляция клавиш Canvas и отсутствие автособытий; два экземпляра', async ({ page }) => {
  await create(page);
  await add(page, 'web.modal_open');
  await add(page, 'web.modal_close');
  const node = await add(page, 'web.modal');
  await config(page, 'Заголовок окна').fill('   ');
  await page.getByTestId('debug-tab-web').click();
  await expect(openers(page)).toHaveText('Открыть окно: Модальное окно');
  await config(page, 'Заголовок окна').fill('Справка');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  await openers(page).click();
  const dialog = page.getByRole('dialog', { name: 'Справка', exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((d) => d.matches(':modal'))).toBe(true);
  await page.mouse.click(2, 2);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Закрыть окно', exact: true }).focus();
  await expect(dialog.getByRole('button', { name: 'Закрыть окно', exact: true })).toBeFocused();
  for (const key of ['Tab', 'Shift+Tab', 'Delete', 'Backspace', 'Control+d', 'Control+z']) {
    await page.keyboard.press(key);
    await expect(page.getByTestId('canvas-node-web.modal')).toHaveCount(1);
    await expect(dialog.getByRole('heading', { name: 'Справка' })).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(openers(page)).toBeFocused();
  // Обработчики редактора восстановлены после закрытия.
  await node.click();
  await page.keyboard.press('Control+d');
  await expect(openers(page)).toHaveCount(2);
  await openers(page).last().click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть окно', exact: true }).click();
  await expect(openers(page).last()).toBeFocused();
  await page.getByTestId('debug-tab-history').click();
  await expect(page.getByTestId('local-history-entry')).toHaveCount(0);
});

test('данные по проводу, безопасный текст, согласие на изображение сбрасывается при закрытии и F5', async ({ page }) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  let requests = 0;
  await page.route('https://assets.example.com/**', async (route) => { requests++; await route.fulfill({ contentType: 'image/png', body: png }); });
  await create(page);
  const array = await add(page, 'core.array');
  const literal = '<script>alert(1)</script>';
  await config(page, 'Значение').fill(JSON.stringify([
    { kind: 'text', text: literal }, { kind: 'link', href: 'https://example.com/', text: 'Ссылка' },
    { kind: 'image', src: 'https://assets.example.com/a.png', caption: 'Фото' },
  ]));
  const modal = await add(page, 'web.modal');
  await config(page, 'Заголовок окна').fill('Подробности');
  await arrangePair(page, array, modal);
  await connectPorts(page, port(array, 'output', 'value'), port(modal, 'input', 'children'));
  await page.getByTestId('debug-tab-web').click();
  await expect(openers(page)).toHaveCount(0);
  await page.getByTestId('run-button').click();
  await openers(page).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(literal, { exact: true })).toBeVisible();
  await expect(dialog.locator('script, img')).toHaveCount(0);
  expect(requests).toBe(0);
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Загрузить изображение', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Закрыть окно', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Загрузить изображение', exact: true }).click();
  await expect.poll(() => dialog.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  await expect(dialog.getByRole('button', { name: 'Закрыть окно', exact: true })).toBeFocused();
  // Исчезновение кнопки загрузки не должно отдать клавиши редактору.
  await page.keyboard.press('Delete');
  await expect(modal).toHaveCount(1);
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('web-preview').locator('img')).toHaveCount(0);
  await openers(page).click();
  await expect(dialog.getByRole('button', { name: 'Загрузить изображение', exact: true })).toBeVisible();
  expect(requests).toBe(1);
  await expect(page.getByText(/^Сохранено /).first()).toBeVisible();
  await page.reload();
  await page.getByTestId('debug-tab-web').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByTestId('run-button').click();
  await expect(openers(page)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(requests).toBe(1);
});

test('поля и вложенные окна отклоняются целиком; исправление восстанавливает открытие', async ({ page }) => {
  await create(page);
  const array = await add(page, 'core.array');
  await config(page, 'Значение').fill('[{"kind":"input","name":"name","formNodeId":"f","label":"Имя","placeholder":"","value":""}]');
  const modal = await add(page, 'web.modal');
  await arrangePair(page, array, modal);
  await connectPorts(page, port(array, 'output', 'value'), port(modal, 'input', 'children'));
  await page.getByTestId('debug-tab-web').click();
  await page.getByTestId('run-button').click();
  await expect(page.getByTestId('web-preview-layout-element')).toContainText('Внутри модального окна поля и другие окна не поддерживаются');
  await expect(openers(page)).toHaveCount(0);
  await array.click();
  await config(page, 'Значение').fill('[{"kind":"modal","title":"Внутреннее","children":[]}]');
  await page.getByTestId('run-button').click();
  await expect(openers(page)).toHaveCount(0);
  await config(page, 'Значение').fill('[{"kind":"text","text":"Исправлено"}]');
  await page.getByTestId('run-button').click();
  await openers(page).click();
  await expect(page.getByRole('dialog').getByText('Исправлено')).toBeVisible();
  await page.keyboard.press('Escape');
  await config(page, 'Значение').fill('[]');
  await expect(openers(page)).toHaveCount(0); // Старый результат не выдаётся за актуальный.
});

test('узкий экран: окно не обрезается рамкой превью; Escape возвращает фокус', async ({ page }) => {
  await create(page);
  await add(page, 'web.modal');
  await config(page, 'Заголовок окна').fill('Окно на телефоне');
  await page.getByTestId('debug-tab-web').click();
  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByTestId('debug-toggle').click();
  await page.getByTestId('debug-tab-web').click();
  await openers(page).click();
  const dialog = page.getByRole('dialog', { name: 'Окно на телефоне', exact: true });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.height).toBeLessThanOrEqual(640);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(openers(page)).toBeFocused();
  await expect(page.locator('[data-tutorial="debug"]')).toBeVisible();
});
