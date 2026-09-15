import { openResult } from './helpers';
/** 09B2: реальные провода, вложенный DOM, корни, ошибки и F5. */
import { expect, test, type Page } from '@playwright/test';
import { arrangePair, connectPorts, moveNode, port } from './helpers';
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
const config = (page: Page, label: string) => page.locator('[data-tutorial="inspector"]').getByLabel(label, { exact: true });
const run = async (page: Page) => { await page.getByTestId('run-button').click(); };

test('секция → контейнер → сетка: порядок, безопасный текст и восстановление после F5', async ({ page }) => {
  await create(page);
  const array = await add(page, 'core.array');
  const text = '<img src=x onerror="window.injected=1">';
  const children = [{ kind: 'container', children: [{ kind: 'grid', columns: 2, children: [{ kind: 'heading', text: 'Первый', level: 3 }, { kind: 'text', text }] }] }];
  await config(page, 'Значение').fill(JSON.stringify(children));
  const section = await add(page, 'web.section');
  await config(page, 'Заголовок секции').fill('Мой раздел');
  await arrangePair(page, array, section);
  await connectPorts(page, port(array, 'output', 'value'), port(section, 'input', 'children'));
  await openResult(page);
  await page.getByTestId('debug-tab-web').click();
  const root = page.getByTestId('web-preview-layout-element');
  await expect(root).toContainText('Запустите схему');
  await run(page);
  await expect(root.getByRole('region', { name: 'Мой раздел' })).toBeVisible();
  await expect(root.locator('[data-web-kind="section"] > div > [data-web-kind="container"] [data-web-kind="grid"]')).toHaveCount(1);
  await expect(root.locator('[data-web-kind="grid"] [data-web-kind]')).toHaveText(['Первый', text]);
  await expect(root.locator('img, script')).toHaveCount(0);
  await expect(root.locator('[data-web-kind="grid"] > div')).toHaveCSS('grid-template-columns', /\d.*px \d.*px/);
  await expect(page.getByText(/^Сохранено /).first()).toBeVisible();
  await page.reload();
  await openResult(page);
  await page.getByTestId('debug-tab-web').click();
  await expect(root).toContainText('Запустите схему');
  await run(page);
  await expect(root.getByRole('heading', { name: 'Мой раздел' })).toBeVisible();
  await expect(root.locator('[data-web-kind="text"]')).toHaveText(text);
});

test('текст → добавить в массив → сетка: без дубля ребёнка, правки и перенос', async ({ page }) => {
  await create(page);
  const text = await add(page, 'web.text');
  await config(page, 'Текст').fill('Дочерний текст');
  await moveNode(page, text, 400, 180);
  const empty = await add(page, 'core.array');
  await moveNode(page, empty, 400, 340);
  const append = await add(page, 'data.array_add');
  await moveNode(page, append, 810, 230);
  const grid = await add(page, 'web.grid');
  await config(page, 'Колонки (1–6)').fill('2');
  await moveNode(page, grid, 810, 420);
  await connectPorts(page, port(empty, 'output', 'value'), port(append, 'input', 'array'));
  await connectPorts(page, port(text, 'output', 'element'), port(append, 'input', 'item'));
  await connectPorts(page, port(append, 'output', 'array'), port(grid, 'input', 'children'));
  await openResult(page);
  await page.getByTestId('debug-tab-web').click();
  await expect(page.getByTestId('web-preview-text-element')).toHaveCount(0);
  const root = page.getByTestId('web-preview-layout-element');
  await run(page);
  await expect(root.locator('[data-web-kind="text"]')).toHaveText('Дочерний текст');
  await expect(page.getByTestId('web-preview').getByText('Дочерний текст', { exact: true })).toHaveCount(1);
  await moveNode(page, text, 420, 190);
  await expect(root).toContainText('Дочерний текст');
  await text.click();
  await config(page, 'Текст').fill('Новый текст');
  await expect(root).toContainText('Запустите схему');
  await expect(root).not.toContainText('Дочерний текст');
  await run(page);
  await expect(root.locator('[data-web-kind="text"]')).toHaveText('Новый текст');
  await expect(page.getByText(/^Сохранено /).first()).toBeVisible();
  await page.reload();
  await openResult(page);
  await page.getByTestId('debug-tab-web').click();
  await expect(page.getByTestId('web-preview-text-element')).toHaveCount(0);
  await run(page);
  await expect(root.locator('[data-web-kind="text"]')).toHaveText('Новый текст');
});

test('невалидный ребёнок: ошибка вместо частичной страницы; исправление и неверные колонки', async ({ page }) => {
  await create(page);
  const array = await add(page, 'core.array');
  await config(page, 'Значение').fill('[{"kind":"text","text":"Не показывать частично"},{"kind":"html","html":"<script>"}]');
  const grid = await add(page, 'web.grid');
  await arrangePair(page, array, grid);
  await connectPorts(page, port(array, 'output', 'value'), port(grid, 'input', 'children'));
  await run(page);
  await openResult(page);
  await page.getByTestId('debug-tab-ports').click();
  await expect(page.getByTestId('debug-node-web.grid')).toHaveAttribute('data-status', 'error');
  await openResult(page);
  await page.getByTestId('debug-tab-web').click();
  const root = page.getByTestId('web-preview-layout-element');
  await expect(root).not.toContainText('Не показывать частично');
  await expect(root).toContainText('Некорректное дерево Web');
  await array.click();
  await config(page, 'Значение').fill('[{"kind":"text","text":"Исправлено"}]');
  await run(page);
  await expect(root).toContainText('Исправлено');
  await grid.click();
  await config(page, 'Колонки (1–6)').fill('7');
  await run(page);
  await expect(root).not.toContainText('Исправлено');
  await openResult(page);
  await page.getByTestId('debug-tab-ports').click();
  await expect(page.getByTestId('debug-node-web.grid')).toHaveAttribute('data-status', 'error');
  await config(page, 'Колонки (1–6)').fill('1');
  await run(page);
  await openResult(page);
  await page.getByTestId('debug-tab-web').click();
  await expect(root).toContainText('Исправлено');
});

test('пустые структуры доступны без запуска; ошибка настройки видна сразу', async ({ page }) => {
  await create(page);
  await add(page, 'web.container');
  await openResult(page);
  await page.getByTestId('debug-tab-web').click();
  await expect(page.getByTestId('web-preview-layout-element')).toContainText('Нет дочерних элементов');
  await add(page, 'web.grid');
  await config(page, 'Колонки (1–6)').fill('0');
  await expect(page.getByTestId('web-preview-layout-element').last()).toContainText('Проверьте настройки');
  await config(page, 'Колонки (1–6)').fill('3');
  await expect(page.getByTestId('web-preview-layout-element').last()).toContainText('Нет дочерних элементов');
});
