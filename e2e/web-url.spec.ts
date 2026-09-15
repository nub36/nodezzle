import { openResult } from './helpers';
/** 09B3: сеть замокана; проверяем отсутствие авто-запросов, навигацию и реальные провода. */
import { expect, test, type Page } from '@playwright/test';
import { arrangePair, connectPorts, port } from './helpers';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const config = (page: Page, label: string) => page.locator('[data-tutorial="inspector"]').getByLabel(label, { exact: true });
async function create(page: Page) {
  await page.goto('/#/dashboard');
  await page.getByTestId('onboarding-skip').click();
  await page.getByTestId('create-project').click();
  await page.locator('[data-tutorial="library"]').getByRole('button', { name: 'Все', exact: true }).click();
}
async function add(page: Page, id: string) {
  await page.getByTestId('library-search').fill(id);
  await page.getByTestId(`library-item-${id}`).click();
  return page.getByTestId(`canvas-node-${id}`);
}

test('изображение: запрос только по кнопке, no-referrer, смена адреса, ошибка/повтор и F5', async ({ page }) => {
  const requests: string[] = [];
  const referers: Array<string | undefined> = [];
  let attempts = 0;
  await page.route('https://assets.example.com/**', async (route) => {
    requests.push(route.request().url());
    referers.push(route.request().headers().referer);
    if (route.request().url().endsWith('retry.png') && attempts++ === 0) await route.abort();
    else await route.fulfill({ contentType: 'image/png', body: png });
  });
  await create(page);
  await add(page, 'web.image');
  await config(page, 'Адрес изображения (HTTPS)').fill('https://assets.example.com/photo.png');
  const caption = '<script>alert(1)</script>';
  await config(page, 'Подпись изображения').fill(caption);
  await openResult(page);
  await page.getByTestId('debug-tab-web').click();
  const root = page.getByTestId('web-preview-url-element');
  await expect(root.getByRole('button', { name: 'Загрузить изображение', exact: true })).toBeVisible();
  await expect(root.locator('img, script')).toHaveCount(0);
  expect(requests).toEqual([]);
  await root.getByRole('button', { name: 'Загрузить изображение', exact: true }).click();
  await expect(root.getByRole('img', { name: caption, exact: true })).toBeVisible();
  await expect.poll(() => root.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  expect(requests).toHaveLength(1);
  expect(referers).toEqual([undefined]);
  await config(page, 'Адрес изображения (HTTPS)').fill('https://assets.example.com/retry.png');
  await expect(root.locator('img')).toHaveCount(0);
  expect(requests).toHaveLength(1);
  await root.getByRole('button', { name: 'Загрузить изображение', exact: true }).click();
  await expect(root).toContainText('Не удалось загрузить изображение');
  await root.getByRole('button', { name: 'Повторить загрузку', exact: true }).click();
  await expect.poll(() => root.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  expect(requests).toHaveLength(3);
  await expect(page.getByText(/^Сохранено /).first()).toBeVisible();
  await page.reload();
  await openResult(page);
  await page.getByTestId('debug-tab-web').click();
  await expect(root.getByRole('button', { name: 'Загрузить изображение', exact: true })).toBeVisible();
  await expect(root.locator('img')).toHaveCount(0);
  expect(requests).toHaveLength(3);
});

test('ссылка открывает новую вкладку без opener/referrer; опасный адрес не становится ссылкой', async ({ page, context }) => {
  await context.route('https://example.com/destination', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Внешняя страница</h1>' }));
  await create(page);
  await add(page, 'web.link');
  await config(page, 'Адрес ссылки (HTTPS)').fill('https://example.com/destination');
  await config(page, 'Текст').fill('Перейти на сайт');
  await openResult(page);
  await page.getByTestId('debug-tab-web').click();
  const editorUrl = page.url();
  const root = page.getByTestId('web-preview-url-element');
  const link = root.getByRole('link', { name: /Перейти на сайт/ });
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(link).toHaveAttribute('target', '_blank');
  const popupPromise = page.waitForEvent('popup');
  await link.click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  expect(await popup.evaluate(() => document.referrer)).toBe('');
  expect(page.url()).toBe(editorUrl);
  await popup.close();
  await config(page, 'Адрес ссылки (HTTPS)').fill('javascript:alert(1)');
  await expect(root.getByRole('link')).toHaveCount(0);
  await expect(root).toContainText('Укажите абсолютный HTTPS-адрес');
  await config(page, 'Адрес ссылки (HTTPS)').fill('https://example.com/destination');
  await config(page, 'Текст').fill('');
  await expect(root.getByRole('link')).toContainText('https://example.com/destination');
});

test('URL по проводу: ожидание, актуальный адрес, смена и восстановление после F5', async ({ page }) => {
  await create(page);
  const source = await add(page, 'core.url');
  await config(page, 'Значение').fill('https://example.com/first');
  const link = await add(page, 'web.link');
  await config(page, 'Текст').fill('Из схемы');
  await arrangePair(page, source, link);
  await connectPorts(page, port(source, 'output', 'value'), port(link, 'input', 'href'));
  await openResult(page);
  await page.getByTestId('debug-tab-web').click();
  const root = page.getByTestId('web-preview-url-element');
  await expect(root).toContainText('Запустите схему');
  await page.getByTestId('run-button').click();
  await expect(root.getByRole('link')).toHaveAttribute('href', 'https://example.com/first');
  await source.click();
  await config(page, 'Значение').fill('https://example.com/second');
  await expect(root.getByRole('link')).toHaveCount(0);
  await page.getByTestId('run-button').click();
  await expect(root.getByRole('link')).toHaveAttribute('href', 'https://example.com/second');
  await expect(page.getByText(/^Сохранено /).first()).toBeVisible();
  await page.reload();
  await openResult(page);
  await page.getByTestId('debug-tab-web').click();
  await expect(root.getByRole('link')).toHaveCount(0);
  await page.getByTestId('run-button').click();
  await expect(root.getByRole('link')).toHaveAttribute('href', 'https://example.com/second');
});

test('картинка и ссылка внутри сетки: проверка всего дерева, без исполнения дополнительных атрибутов', async ({ page }) => {
  let requests = 0;
  await page.route('https://assets.example.com/**', async (route) => {
    requests++;
    await route.fulfill({ contentType: 'image/png', body: png });
  });
  await create(page);
  const array = await add(page, 'core.array');
  const children = [{ kind: 'image', src: 'https://assets.example.com/a.png', caption: 'Фото', onerror: 'alert(1)' }, { kind: 'link', href: 'https://example.com/', text: '<b>Сайт</b>', target: '_self' }];
  await config(page, 'Значение').fill(JSON.stringify(children));
  const grid = await add(page, 'web.grid');
  await arrangePair(page, array, grid);
  await connectPorts(page, port(array, 'output', 'value'), port(grid, 'input', 'children'));
  await openResult(page);
  await page.getByTestId('debug-tab-web').click();
  await page.getByTestId('run-button').click();
  const root = page.getByTestId('web-preview-layout-element');
  await expect(root.locator('[data-web-kind="image"]')).toHaveCount(1);
  await expect(root.getByRole('link')).toContainText('<b>Сайт</b>');
  await expect(root.locator('b, img')).toHaveCount(0);
  expect(requests).toBe(0);
  await root.getByRole('button', { name: 'Загрузить изображение', exact: true }).click();
  await expect.poll(() => root.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  await expect(root.locator('img')).not.toHaveAttribute('onerror');
  await array.click();
  children[0].src = 'data:image/svg+xml,<svg/>';
  await config(page, 'Значение').fill(JSON.stringify(children));
  await page.getByTestId('run-button').click();
  await expect(root).toContainText('Некорректное дерево Web');
  await expect(root.locator('img, a')).toHaveCount(0);
  expect(requests).toBe(1);
});
