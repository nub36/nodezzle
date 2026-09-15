import { expect, test, type Page } from '@playwright/test';
import { arrangePair, connectPorts, moveNode, port } from './helpers';
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
  return page.getByTestId(`canvas-node-${id}`).last();
}
async function form(page: Page) {
  const node = await add(page, 'web.form');
  await config(page, 'Режим формы').selectOption('fields');
  return { node, id: (await node.getAttribute('data-node-id'))! };
}
async function field(page: Page, kind: string, formId: string, name: string, label: string) {
  const node = await add(page, kind);
  await config(page, 'Имя поля (ключ данных)').fill(name);
  await config(page, 'Форма для поля').selectOption(formId);
  await config(page, 'Подпись поля').fill(label);
  return node;
}
async function output(page: Page, expected: Record<string, unknown>, last = false) {
  await page.getByTestId('debug-tab-ports').click();
  const node = page.getByTestId('debug-node-web.form');
  const target = last ? node.last() : node.first();
  await expect(target).toHaveAttribute('data-status', 'success');
  expect(JSON.parse(await target.getByTestId('output-data').innerText())).toEqual(expected);
}

test('поля отправляют строки и переносы, черновики сбрасываются после F5, начальное значение сохраняется', async ({ page }) => {
  await create(page);
  const f = await form(page);
  const log = await add(page, 'debug.log');
  await arrangePair(page, f.node, log);
  await connectPorts(page, port(f.node, 'output', 'data'), port(log, 'input', 'value'));
  await field(page, 'web.input', f.id, 'name', 'Ваше имя');
  await config(page, 'Начальное значение').fill('Начальное');
  await field(page, 'web.textarea', f.id, 'message', 'Сообщение');
  await page.getByTestId('debug-tab-web').click();
  const preview = page.getByTestId('web-preview');
  await expect(preview.getByRole('textbox', { name: 'Ваше имя', exact: true })).toHaveValue('Начальное');
  await preview.getByRole('textbox', { name: 'Ваше имя', exact: true }).fill('Анна');
  await preview.getByRole('textbox', { name: 'Сообщение', exact: true }).fill('Первая\nВторая 🌿');
  await page.getByTestId('web-preview-form').getByRole('button').click();
  await output(page, { name: 'Анна', message: 'Первая\nВторая 🌿' });
  await expect(page.getByTestId('debug-node-debug.log').getByTestId('input-value')).toContainText('Анна');
  await expect(page.getByText(/^Сохранено /).first()).toBeVisible();
  await page.reload();
  await page.getByTestId('debug-tab-web').click();
  await expect(preview.getByRole('textbox', { name: 'Ваше имя', exact: true })).toHaveValue('Начальное');
  await expect(preview.getByRole('textbox', { name: 'Сообщение', exact: true })).toHaveValue('');
  await preview.getByRole('textbox', { name: 'Ваше имя', exact: true }).fill('');
  await page.getByTestId('web-preview-form').getByRole('button').click();
  await output(page, { name: '', message: '' });
});

test('копия поля вместе с формой адресует свою цепочку; одинаковые имена независимы', async ({ page }) => {
  await create(page);
  const f = await form(page);
  await moveNode(page, f.node, 400, 180);
  const input = await field(page, 'web.input', f.id, 'name', 'Имя');
  await moveNode(page, input, 400, 360);
  const log = await add(page, 'debug.log');
  await moveNode(page, log, 810, 250);
  await connectPorts(page, port(f.node, 'output', 'data'), port(log, 'input', 'value'));
  await f.node.click();
  await input.click({ modifiers: ['Control'] });
  await log.click({ modifiers: ['Control'] });
  await page.keyboard.press('Control+d');
  await page.getByTestId('debug-tab-web').click();
  const names = page.getByTestId('web-preview').getByRole('textbox', { name: 'Имя', exact: true });
  await expect(names).toHaveCount(2);
  await names.first().fill('Первый');
  await names.last().fill('Второй');
  await page.getByTestId('web-preview-form').last().getByRole('button').click();
  await output(page, { name: 'Второй' }, true);
  await expect(page.getByTestId('debug-node-web.form').first()).toHaveAttribute('data-status', 'skipped');
  await expect(page.getByTestId('debug-node-debug.log').getByTestId('input-value')).toHaveCount(1);
});

test('дубликаты блокируют только поля, JSON остаётся прежним режимом без смешивания', async ({ page }) => {
  await create(page);
  const f = await form(page);
  await field(page, 'web.input', f.id, 'name', 'Первое');
  const second = await field(page, 'web.textarea', f.id, 'name', 'Второе');
  await page.getByTestId('debug-tab-web').click();
  const formView = page.getByTestId('web-preview-form');
  await expect(formView.getByRole('button')).toBeDisabled();
  await expect(formView.getByRole('alert')).toContainText('уникальными');
  await second.click();
  await config(page, 'Имя поля (ключ данных)').fill('message');
  await expect(formView.getByRole('button')).toBeEnabled();
  await f.node.click();
  await config(page, 'Режим формы').selectOption('json');
  await expect(page.getByTestId('web-preview').getByRole('textbox', { name: 'Первое', exact: true })).toBeDisabled();
  await formView.getByRole('textbox').fill('{bad');
  await expect(formView.getByRole('button')).toBeDisabled();
  await formView.getByRole('textbox').fill('{"count":0,"ok":false}');
  await formView.getByRole('button').click();
  await output(page, { count: 0, ok: false });
});

test('удалённая форма и копия одного поля не получают внешнюю привязку', async ({ page }) => {
  await create(page);
  const f = await form(page);
  const input = await field(page, 'web.input', f.id, 'name', 'Имя');
  await input.click();
  await page.keyboard.press('Control+d');
  await page.getByTestId('debug-tab-web').click();
  const names = page.getByTestId('web-preview').getByRole('textbox', { name: 'Имя', exact: true });
  await expect(names.first()).toBeEnabled();
  await expect(names.last()).toBeDisabled();
  await f.node.click();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('web-preview-form')).toHaveCount(0);
  await expect(names.first()).toBeDisabled();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('web-preview-form')).toHaveCount(1);
  await expect(names.first()).toBeEnabled();
});

test('вложенное поле: загрузка страницы готовит дерево, submit собирает внешний контрол, правка блокирует неполный ввод', async ({ page }) => {
  await create(page);
  const f = await form(page);
  await moveNode(page, f.node, 400, 140);
  const webPage = await add(page, 'web.page');
  await moveNode(page, webPage, 400, 280);
  const array = await add(page, 'core.array');
  await config(page, 'Значение').fill(JSON.stringify([{ kind: 'textarea', name: 'message', formNodeId: f.id, label: 'Вложенное поле', placeholder: '', value: '' }]));
  await moveNode(page, array, 400, 450);
  const set = await add(page, 'data.object_set');
  await config(page, 'Ключ').fill('fields');
  await moveNode(page, set, 810, 140);
  const get = await add(page, 'data.object_get');
  await config(page, 'Ключ').fill('fields');
  await moveNode(page, get, 810, 320);
  const grid = await add(page, 'web.grid');
  await moveNode(page, grid, 810, 490);
  await connectPorts(page, port(webPage, 'output', 'data'), port(set, 'input', 'object'));
  await connectPorts(page, port(array, 'output', 'value'), port(set, 'input', 'value'));
  await connectPorts(page, port(set, 'output', 'object'), port(get, 'input', 'object'));
  await connectPorts(page, port(get, 'output', 'value'), port(grid, 'input', 'children'));
  await page.getByTestId('debug-tab-web').click();
  const nested = page.getByTestId('web-preview-layout-element').getByRole('textbox', { name: 'Вложенное поле', exact: true });
  await expect(nested).toBeEnabled();
  await nested.fill('Из контейнера');
  await page.getByTestId('web-preview-form').getByRole('button').click();
  await output(page, { message: 'Из контейнера' });
  await page.getByTestId('debug-tab-web').click();
  // Возврат на вкладку монтирует превью заново и вызывает page_load (09A).
  await expect(nested).toHaveValue('');
  await grid.click();
  await config(page, 'Колонки (1–6)').fill('3');
  await expect(page.getByTestId('web-preview-form').getByRole('button')).toBeDisabled();
  await page.getByRole('button', { name: 'Перезагрузить страницу', exact: true }).click();
  await expect(nested).toHaveValue('');
  await expect(page.getByTestId('web-preview-form').getByRole('button')).toBeEnabled();
});
