import { openResult } from './helpers';
/** 09B1: реальные элементы, безопасный вывод и свежесть результата. */
import { expect, test, type Page } from '@playwright/test';
import { arrangePair, connectPorts, port, moveNode } from './helpers';
async function create(page: Page) {
  await page.goto('/#/dashboard');
  await page.getByTestId('onboarding-skip').click();
  await page.getByTestId('create-project').click();
}
async function add(page: Page, id: string) {
  await page.getByTestId('library-search').fill(id);
  await page.getByTestId(`library-item-${id}`).click();
  return page.getByTestId(`canvas-node-${id}`);
}
const config = (page: Page, label: string) => page.locator('[data-tutorial="inspector"]').getByLabel(label, { exact: true });

test('текст и заголовок: настройки сразу в превью, HTML не исполняется, F5 сохраняет', async ({ page }) => {
  await create(page);
  await add(page, 'web.text');
  const literal = '<img src=x onerror="window.injected=1"><script>alert(1)</script>';
  await config(page, 'Текст').fill(literal);
  await add(page, 'web.heading');
  await config(page, 'Текст').fill('Моя страница');
  await config(page, 'Уровень заголовка (1–6)').fill('3');
  await openResult(page);
  await page.getByTestId('debug-tab-web').click();
  const preview = page.getByTestId('web-preview');
  await expect(preview.getByRole('heading', { level: 3 })).toHaveText('Моя страница');
  await expect(preview.getByTestId('web-preview-text-element').first()).toHaveText(literal);
  await expect(preview.locator('img, script')).toHaveCount(0);
  await page.getByTestId('run-button').click();
  await openResult(page);
  await page.getByTestId('debug-tab-ports').click();
  await expect(page.getByTestId('debug-node-web.text')).toHaveAttribute('data-status', 'success');
  await expect(page.getByTestId('debug-node-web.heading')).toHaveAttribute('data-status', 'success');
  await expect(page.getByText(/^Сохранено /).first()).toBeVisible();
  await page.reload();
  await openResult(page);
  await page.getByTestId('debug-tab-web').click();
  await expect(preview.getByRole('heading', { level: 3 })).toHaveText('Моя страница');
  await expect(preview.getByTestId('web-preview-text-element').first()).toHaveText(literal);
});

test('вход из схемы: ожидание запуска, обновление данных, перемещение без потери результата', async ({ page }) => {
  await create(page);
  const source = await add(page, 'core.text');
  await config(page, 'Значение').fill('Из схемы: 42');
  const target = await add(page, 'web.text');
  await config(page, 'Текст').fill('Не заменяет вход');
  await arrangePair(page, source, target);
  await connectPorts(page, port(source, 'output', 'text'), port(target, 'input', 'text'));
  await openResult(page);
  await page.getByTestId('debug-tab-web').click();
  const element = page.getByTestId('web-preview-text-element');
  await expect(element).toContainText('Запустите схему');
  await page.getByTestId('run-button').click();
  await expect(element).toHaveText('Из схемы: 42');
  await moveNode(page, source, 400, 240);
  await expect(element).toHaveText('Из схемы: 42');
  await source.click();
  await config(page, 'Значение').fill('После правки: 73');
  await expect(element).toContainText('Запустите схему');
  await expect(element).not.toContainText('Из схемы: 42');
  await page.getByTestId('run-button').click();
  await expect(element).toHaveText('После правки: 73');
  await expect(page.getByText(/^Сохранено /).first()).toBeVisible();
  await page.reload();
  await openResult(page);
  await page.getByTestId('debug-tab-web').click();
  await expect(element).toContainText('Запустите схему');
  await page.getByTestId('run-button').click();
  await expect(element).toHaveText('После правки: 73');
});

test('неверный уровень заголовка показывает ошибку, исправление восстанавливает элемент', async ({ page }) => {
  await create(page);
  await add(page, 'web.heading');
  await config(page, 'Текст').fill('Заголовок');
  await config(page, 'Уровень заголовка (1–6)').fill('7');
  await openResult(page);
  await page.getByTestId('debug-tab-web').click();
  await expect(page.getByTestId('web-preview-text-element')).toContainText('Проверьте настройки');
  await page.getByTestId('run-button').click();
  await openResult(page);
  await page.getByTestId('debug-tab-ports').click();
  await expect(page.getByTestId('debug-node-web.heading')).toHaveAttribute('data-status', 'error');
  await config(page, 'Уровень заголовка (1–6)').fill('1');
  await openResult(page);
  await page.getByTestId('debug-tab-web').click();
  await expect(page.getByTestId('web-preview').getByRole('heading', { level: 1 })).toHaveText('Заголовок');
});
