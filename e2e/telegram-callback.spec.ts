import { openResult } from './helpers';
import { expect, test, type Page } from '@playwright/test';
import { arrangePair, connectPorts, port } from './helpers';
const config = (page: Page, label: string) => page.locator('[data-tutorial="inspector"]').getByLabel(label, { exact: true });
async function add(page: Page, id: string) {
  await page.getByTestId('library-search').fill(id);
  await page.getByTestId(`library-item-${id}`).click();
  return page.getByTestId(`canvas-node-${id}`).last();
}
async function setup(page: Page) {
  await page.goto('/#/dashboard');
  await page.getByTestId('onboarding-skip').click();
  await page.getByTestId('create-project').click();
  await page.locator('[data-tutorial="library"]').getByRole('button', { name: 'Все', exact: true }).click();
  const q = await add(page, 'telegram.callback_query');
  await config(page, 'Фильтр данных кнопки (пусто — все)').fill('confirm');
  const a = await add(page, 'telegram.answer_callback');
  await config(page, 'Текст').fill('Подтверждено <b>без HTML</b>');
  await config(page, 'Показать окно Telegram').check();
  await arrangePair(page, q, a);
  await connectPorts(page, port(q, 'output', 'callback_id'), port(a, 'input', 'callback_id'));
  await openResult(page);
  await page.getByTestId('debug-tab-simulator').click();
  return { q, a };
}
const simulator = (page: Page, name: string) => page.locator('[data-tutorial="debug"]').getByLabel(name, { exact: true });

test('callback симулятора → провод ID → ответ; обычное сообщение не запускает callback; F5', async ({ page }) => {
  await setup(page);
  await page.getByTestId('run-button').click();
  await openResult(page);
  await page.getByTestId('debug-tab-chat').click();
  await expect(page.getByTestId('telegram-callback-answer')).toHaveCount(0);
  await openResult(page);
  await page.getByTestId('debug-tab-simulator').click();
  await simulator(page, 'Событие Telegram').selectOption('callback_query');
  await simulator(page, 'ID callback-запроса').fill('browser-cb');
  await simulator(page, 'ID сообщения с кнопкой').fill('55');
  await page.getByTestId('run-button').click();
  await openResult(page);
  await page.getByTestId('debug-tab-ports').click();
  await expect(page.getByTestId('debug-node-telegram.callback_query').getByTestId('output-callback_id')).toHaveText('"browser-cb"');
  await expect(page.getByTestId('debug-node-telegram.callback_query').getByTestId('output-message_id')).toHaveText('55');
  await expect(page.getByTestId('debug-node-telegram.answer_callback').getByTestId('output-ok')).toHaveText('true');
  await openResult(page);
  await page.getByTestId('debug-tab-chat').click();
  const notice = page.getByTestId('telegram-callback-answer');
  await expect(notice).toContainText('окно Telegram (симуляция)');
  await expect(notice).toContainText('Подтверждено <b>без HTML</b>');
  await expect(notice.locator('b')).toHaveCount(0);
  await expect(page.getByTestId('simulator-chat-bot')).toHaveCount(0);
  await expect(page.getByTestId('simulator-chat-user')).toHaveCount(0);
  await openResult(page);
  await page.getByTestId('debug-tab-phone').click();
  await expect(notice).toContainText('Подтверждено');
  await expect(page.getByText(/^Сохранено /).first()).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('canvas-node-telegram.callback_query')).toHaveCount(1);
  await expect(page.getByTestId('canvas-node-telegram.answer_callback')).toHaveCount(1);
  await openResult(page);
  await page.getByTestId('debug-tab-simulator').click();
  await expect(simulator(page, 'Событие Telegram')).toHaveValue('message');
  await simulator(page, 'Событие Telegram').selectOption('callback_query');
  await page.getByTestId('run-button').click();
  await openResult(page);
  await page.getByTestId('debug-tab-chat').click();
  await expect(notice).toContainText('Подтверждено');
});

test('фильтр и лимит UTF-8: неверные данные не отправляют ответ; исправление, пустой текст, false', async ({ page }) => {
  const { a } = await setup(page);
  await simulator(page, 'Событие Telegram').selectOption('callback_query');
  for (const data of ['cancel', 'я'.repeat(33)]) {
    await simulator(page, 'Данные кнопки').fill(data);
    if (data.length > 10) await expect(page.getByRole('alert').filter({ hasText: 'Некорректный callback' })).toBeVisible();
    await page.getByTestId('run-button').click();
    await openResult(page);
    await page.getByTestId('debug-tab-chat').click();
    await expect(page.getByTestId('telegram-callback-answer')).toHaveCount(0);
    await openResult(page);
    await page.getByTestId('debug-tab-simulator').click();
  }
  await simulator(page, 'Данные кнопки').fill('confirm');
  await a.click();
  await config(page, 'Текст').fill('');
  await config(page, 'Показать окно Telegram').uncheck();
  await page.getByTestId('run-button').click();
  await openResult(page);
  await page.getByTestId('debug-tab-chat').click();
  await expect(page.getByTestId('telegram-callback-answer')).toContainText('уведомление (симуляция)');
  await expect(page.getByTestId('telegram-callback-answer')).toContainText('Подтверждение без текста');
});

test('два callback-фильтра и обычный триггер: выполняется только подходящий', async ({ page }) => {
  await setup(page);
  await add(page, 'telegram.callback_query');
  await config(page, 'Фильтр данных кнопки (пусто — все)').fill('cancel');
  await add(page, 'telegram.message_received');
  await simulator(page, 'Событие Telegram').selectOption('callback_query');
  await page.getByTestId('run-button').click();
  await openResult(page);
  await page.getByTestId('debug-tab-ports').click();
  const queries = page.getByTestId('debug-node-telegram.callback_query');
  await expect(queries.first()).toHaveAttribute('data-status', 'success');
  await expect(queries.last()).toHaveAttribute('data-status', 'skipped');
  await expect(page.getByTestId('debug-node-telegram.message_received')).toHaveAttribute('data-status', 'skipped');
  await openResult(page);
  await page.getByTestId('debug-tab-simulator').click();
  await simulator(page, 'Событие Telegram').selectOption('message');
  await page.getByTestId('run-button').click();
  await openResult(page);
  await page.getByTestId('debug-tab-ports').click();
  await expect(queries.first()).toHaveAttribute('data-status', 'skipped');
  await expect(queries.last()).toHaveAttribute('data-status', 'skipped');
  await expect(page.getByTestId('debug-node-telegram.message_received')).toHaveAttribute('data-status', 'success');
});


test('переход из callback-схемы в урок без перезагрузки возвращает режим сообщения', async ({ page }) => {
  await setup(page);
  await simulator(page, 'Событие Telegram').selectOption('callback_query');
  const projectHash = await page.evaluate(() => window.location.hash);
  await page.evaluate(() => { window.location.hash = '#/academy'; });
  await page.getByTestId('lesson-card-intro-what').click();
  await page.getByTestId('lesson-start').click();
  await expect(page.getByTestId('tutorial-card')).toBeVisible();
  await page.evaluate((hash) => { window.location.hash = hash; }, projectHash);
  await openResult(page);
  await page.getByTestId('debug-tab-simulator').click();
  await expect(simulator(page, 'Событие Telegram')).toHaveValue('message');
});
