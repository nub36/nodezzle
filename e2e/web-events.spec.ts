/** 09A: одинаковые подписи не означают одинаковый адрес события. */
import { expect, test, type Page } from '@playwright/test';
import { arrangePair, connectPorts, port } from './helpers';

async function create(page: Page) {
  await page.goto('/#/dashboard');
  await page.getByTestId('onboarding-skip').click();
  await page.getByTestId('create-project').click();
  await page.locator('[data-tutorial="library"]').getByRole('button', { name: 'Все', exact: true }).click();
}
async function add(page: Page, type: string) {
  await page.getByTestId('library-search').fill(type);
  await page.getByTestId(`library-item-${type}`).click();
}
async function pair(page: Page, type: string) {
  await create(page);
  await add(page, type);
  await add(page, 'debug.log');
  const trigger = page.getByTestId(`canvas-node-${type}`);
  const log = page.getByTestId('canvas-node-debug.log');
  await arrangePair(page, trigger, log);
  await connectPorts(page, port(trigger, 'output', 'data'), port(log, 'input', 'value'));
  await trigger.click();
  await log.click({ modifiers: ['Control'] });
  await page.keyboard.press('Control+d');
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
}
async function onlySecond(page: Page, type: string, expected: unknown) {
  await page.getByTestId('debug-tab-ports').click();
  await expect(page.getByTestId(`debug-node-${type}`).first()).toHaveAttribute('data-status', 'skipped');
  await expect(page.getByTestId(`debug-node-${type}`).last()).toHaveAttribute('data-status', 'success');
  const values = page.getByTestId('debug-node-debug.log').getByTestId('input-value');
  await expect(values).toHaveCount(1);
  expect(JSON.parse(await values.innerText())).toMatchObject(expected as Record<string, unknown>);
}

test('две одинаковые кнопки: клик запускает только свою цепочку, в том числе после F5', async ({ page }) => {
  await pair(page, 'web.button');
  await page.getByTestId('debug-tab-web').click();
  await expect(page.getByTestId('web-preview-button')).toHaveText(['Кнопка', 'Кнопка']);
  await page.getByTestId('web-preview-button').last().click();
  await onlySecond(page, 'web.button', { event: 'button_click', button: 'Кнопка' });
  await expect(page.getByText(/^Сохранено /).first()).toBeVisible();
  await page.reload();
  await page.getByTestId('debug-tab-web').click();
  await page.getByTestId('web-preview-button').last().click();
  await onlySecond(page, 'web.button', { event: 'button_click', button: 'Кнопка' });
});

test('две формы: независимые данные и запрет отправки некорректного JSON', async ({ page }) => {
  await pair(page, 'web.form');
  await page.getByTestId('debug-tab-web').click();
  const forms = page.getByTestId('web-preview-form');
  await expect(forms).toHaveCount(2);
  const first = forms.first().getByRole('textbox');
  const second = forms.last().getByRole('textbox');
  const submit = forms.last().getByRole('button');
  for (const invalid of ['{oops', '[]', 'null', '42']) {
    await second.fill(invalid);
    await expect(second).toHaveAttribute('aria-invalid', 'true');
    await expect(forms.last().getByRole('alert')).toBeVisible();
    await expect(submit).toBeDisabled();
  }
  await expect(first).toHaveValue(/Иван/);
  const value = { name: 'Анна', amount: 0, accepted: false, nested: { code: '42' } };
  await second.fill(JSON.stringify(value));
  await expect(forms.last().getByRole('alert')).toBeHidden();
  await submit.click();
  await onlySecond(page, 'web.form', value);
});

test('две страницы: загрузка и перезагрузка относятся только к показанной странице', async ({ page }) => {
  await create(page);
  await add(page, 'web.page');
  await page.getByTestId('canvas-node-web.page').click();
  await page.keyboard.press('Control+d');
  await expect(page.getByTestId('canvas-node-web.page')).toHaveCount(2);
  await page.getByTestId('debug-tab-web').click();
  await page.getByTestId('debug-tab-ports').click();
  await expect(page.getByTestId('debug-node-web.page').first()).toHaveAttribute('data-status', 'success');
  await expect(page.getByTestId('debug-node-web.page').last()).toHaveAttribute('data-status', 'skipped');
  await page.getByTestId('debug-tab-web').click();
  await page.getByTestId('web-preview').getByRole('button', { name: /загруз|обнов|перезагруз/i }).click();
  await page.getByTestId('debug-tab-ports').click();
  await expect(page.getByTestId('debug-node-web.page').first()).toHaveAttribute('data-status', 'success');
  await expect(page.getByTestId('debug-node-web.page').last()).toHaveAttribute('data-status', 'skipped');
});
