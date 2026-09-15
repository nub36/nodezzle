import { openResult } from './helpers';
import { expect, test, type Page } from '@playwright/test';
import { arrangePair, connectPorts, moveNode, port } from './helpers';
const config = (page: Page, name: string) => page.locator('[data-tutorial="inspector"]').getByLabel(name, { exact: true });
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
  const trigger = await add(page, 'telegram.message_received');
  const send = await add(page, 'telegram.send_message');
  await arrangePair(page, trigger, send);
  await connectPorts(page, port(trigger, 'output', 'text'), port(send, 'input', 'text'));
  await connectPorts(page, port(trigger, 'output', 'chat_id'), port(send, 'input', 'chat_id'));
  await moveNode(page, trigger, 400, 425);
  const keyboard = await add(page, 'telegram.inline_keyboard');
  await config(page, 'Ряды кнопок (JSON)').fill('[[{"text":"Одинаково","callback_data":"yes"},{"text":"Одинаково","callback_data":"no"}],[{"text":"<b>Текст</b>","callback_data":"html"}]]');
  await arrangePair(page, keyboard, send);
  await connectPorts(page, port(keyboard, 'output', 'keyboard'), port(send, 'input', 'keyboard'));
  await moveNode(page, keyboard, 640, 180);
  const callback = await add(page, 'telegram.callback_query');
  const answer = await add(page, 'telegram.answer_callback');
  await moveNode(page, send, 870, 540);
  await arrangePair(page, callback, answer);
  await connectPorts(page, port(callback, 'output', 'callback_id'), port(answer, 'input', 'callback_id'));
  await connectPorts(page, port(callback, 'output', 'data'), port(answer, 'input', 'text'));
  return { keyboard, trigger };
}
const buttons = (page: Page) => page.getByTestId('telegram-keyboard').getByRole('button');
async function run(page: Page) {
  await page.getByTestId('run-button').click();
  await openResult(page);
  await page.getByTestId('debug-tab-chat').click();
  await expect(buttons(page)).toHaveCount(3);
  await expect(buttons(page).first()).toBeEnabled();
}

test('ряды/одинаковые подписи/безопасный текст; Chat → callback от конкретной кнопки → ответ', async ({ page }) => {
  await setup(page);
  await run(page);
  await expect(buttons(page).nth(2)).toHaveText('<b>Текст</b>');
  await expect(page.getByTestId('telegram-keyboard').locator('b')).toHaveCount(0);
  await buttons(page).nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('telegram-callback-answer')).toContainText('no');
  await expect(page.getByTestId('telegram-keyboard')).toHaveCount(0);
  await expect(page.getByTestId('simulator-chat-user')).toHaveCount(0);
  await openResult(page);
  await page.getByTestId('debug-tab-ports').click();
  const query = page.getByTestId('debug-node-telegram.callback_query');
  await expect(query.getByTestId('output-data')).toHaveText('"no"');
  await expect(query.getByTestId('output-chat_id')).toHaveText('1000');
  await expect(query.getByTestId('output-message_id')).toHaveText('9001');
  await expect(page.getByTestId('debug-node-telegram.message_received')).toHaveAttribute('data-status', 'skipped');
});

test('перенос не сбрасывает кнопки; правка и невалидный JSON блокируют; F5 сохраняет схему, не сообщения', async ({ page }) => {
  const { keyboard } = await setup(page);
  await run(page);
  await moveNode(page, keyboard, 665, 190);
  await expect(buttons(page).first()).toBeEnabled();
  await keyboard.click();
  await config(page, 'Ряды кнопок (JSON)').fill('broken');
  await expect(buttons(page).first()).toBeDisabled();
  await page.getByTestId('run-button').click();
  await expect(page.getByTestId('simulator-chat-bot')).toHaveCount(0);
  await openResult(page);
  await page.getByTestId('debug-tab-ports').click();
  await expect(page.getByTestId('debug-node-telegram.inline_keyboard')).toHaveAttribute('data-status', 'error');
  await config(page, 'Ряды кнопок (JSON)').fill('[[{"text":"Исправлено","callback_data":"fixed"}]]');
  await page.getByTestId('run-button').click();
  await openResult(page);
  await page.getByTestId('debug-tab-chat').click();
  await expect(buttons(page)).toHaveText('Исправлено');
  await expect(page.getByText(/^Сохранено /).first()).toBeVisible();
  await page.reload();
  await openResult(page);
  await page.getByTestId('debug-tab-chat').click();
  await expect(buttons(page)).toHaveCount(0);
  await page.getByTestId('run-button').click();
  await expect(buttons(page)).toHaveText('Исправлено');
  await buttons(page).click();
  await expect(page.getByTestId('telegram-callback-answer')).toContainText('fixed');
});

test('Телефон 390 px: реальный клик, повторный запуск без автопереключения симулятора, неверный userId', async ({ page }) => {
  await setup(page);
  await run(page);
  await openResult(page);
  await page.getByTestId('debug-tab-simulator').click();
  await page.locator('[data-tutorial="debug"]').getByLabel('ID пользователя', { exact: true }).fill('0');
  await openResult(page);
  await page.getByTestId('debug-tab-chat').click();
  await expect(buttons(page).first()).toBeDisabled();
  await openResult(page);
  await page.getByTestId('debug-tab-simulator').click();
  await page.locator('[data-tutorial="debug"]').getByLabel('ID пользователя', { exact: true }).fill('77');
  await openResult(page);
  await page.getByTestId('debug-tab-phone').click();
  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByTestId('debug-toggle').click();
  await openResult(page);
  await page.getByTestId('debug-tab-phone').click();
  await expect(buttons(page).first()).toBeEnabled();
  const box = await page.getByTestId('telegram-keyboard').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await buttons(page).first().click();
  await expect(page.getByTestId('telegram-callback-answer')).toContainText('yes');
  await openResult(page);
  await page.getByTestId('debug-tab-ports').click();
  await expect(page.getByTestId('debug-node-telegram.callback_query').getByTestId('output-user_id')).toHaveText('77');
  await page.getByTestId('run-button').click();
  await openResult(page);
  await page.getByTestId('debug-tab-phone').click();
  await expect(buttons(page)).toHaveCount(3);
});
