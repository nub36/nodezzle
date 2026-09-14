/** 07B: проходим практику через UI и проверяем результат, а не только индекс шага. */
import { expect, test, type Page } from '@playwright/test';
import { connectPorts, moveNode, port } from './helpers';
import { startLesson, step, add, completed } from './lesson-helpers';

async function buildConverterLesson(page: Page) {
  await startLesson(page, 'data-converters');
  await step(page, 'add-text');
  const text = await add(page, 'core.text');
  await step(page, 'set-value');
  const value = page.locator('[data-tutorial="inspector"]').getByLabel('Значение', { exact: true });
  await value.fill('41');
  await page.getByTestId('tutorial-recheck').click();
  await step(page, 'set-value');
  await value.fill('42');
  await step(page, 'add-converter');
  const converter = await add(page, 'data.text_to_number');
  await step(page, 'connect-1');
  await moveNode(page, converter, 680, 310);
  await moveNode(page, text, 360, 180);
  await connectPorts(page, port(text, 'output', 'text'), port(converter, 'input', 'value'));
  await step(page, 'add-log');
  const log = await add(page, 'debug.log');
  await step(page, 'connect-2');
  await moveNode(page, log, 840, 480);
  await connectPorts(page, port(converter, 'output', 'value'), port(log, 'input', 'value'));
  await step(page, 'run');
  return { text, converter, log };
}

test('конвертеры: неверное значение не засчитывается, текст 42 становится числом 42', async ({ page }) => {
  await buildConverterLesson(page);
  await page.getByTestId('run-button').click();
  // Просмотр результата — самостоятельный шаг, не должен проскакивать
  // только потому, что панель «Симулятор» уже была открыта.
  await step(page, 'debug');
  await page.getByTestId('debug-toggle').click();
  await expect(page.getByTestId('debug-tab-ports')).toBeHidden();
  await step(page, 'debug');
  const toggleBox = (await page.getByTestId('debug-toggle').boundingBox())!;
  await expect.poll(async () => (await page.getByTestId('tutorial-highlight').boundingBox())?.width).toBeCloseTo(toggleBox.width + 12, 0);
  await page.getByTestId('debug-toggle').click();
  await page.getByTestId('debug-tab-log').click();
  await step(page, 'debug');
  await page.getByTestId('debug-tab-ports').click();
  const conversion = page.getByTestId('debug-node-data.text_to_number');
  await expect(conversion).toHaveAttribute('data-status', 'success');
  await expect(conversion.getByTestId('input-value')).toHaveText('"42"');
  await expect(conversion.getByTestId('output-value')).toHaveText('42');
  await expect(page.getByTestId('debug-node-debug.log').getByTestId('input-value')).toHaveText('42');
  await completed(page, 'data-converters');
});

test('эхо-бот: два нужных соединения, ответ с тем же текстом в заданный чат, викторина', async ({ page }) => {
  await startLesson(page, 'telegram-first-bot');
  await step(page, 'add-trigger');
  const trigger = await add(page, 'telegram.message_received');
  await step(page, 'add-send');
  const send = await add(page, 'telegram.send_message');
  await step(page, 'connect-text');
  await moveNode(page, send, 810, 390);
  await moveNode(page, trigger, 400, 180);
  await connectPorts(page, port(trigger, 'output', 'text'), port(send, 'input', 'text'));
  await step(page, 'connect-chat');
  // Даже совместимый Число → Число не равен требуемому идентификатору чата.
  await connectPorts(page, port(trigger, 'output', 'user_id'), port(send, 'input', 'chat_id'));
  await step(page, 'connect-chat');
  await page.getByTitle('Отменить (Ctrl+Z)').click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await connectPorts(page, port(trigger, 'output', 'chat_id'), port(send, 'input', 'chat_id'));
  await step(page, 'send');
  const message = 'Привет, NODEZZLE! 42 — проверка эхо.';
  await page.getByLabel('Текст сообщения', { exact: true }).fill(message);
  await page.getByLabel('ID чата', { exact: true }).fill('24680');
  await page.getByTestId('run-button').click();
  await step(page, 'chat');
  const chatTab = (await page.getByTestId('debug-tab-chat').boundingBox())!;
  await expect.poll(async () => (await page.getByTestId('tutorial-highlight').boundingBox())?.x).toBeCloseTo(chatTab.x - 6, 0);
  await page.getByTestId('debug-tab-ports').click();
  await step(page, 'chat');
  const sent = page.getByTestId('debug-node-telegram.send_message');
  await expect(sent).toHaveAttribute('data-status', 'success');
  await expect(sent.getByTestId('input-chat_id')).toHaveText('24680');
  await expect(sent.getByTestId('input-text')).toHaveText(JSON.stringify(message));
  await page.getByTestId('debug-tab-chat').click();
  await step(page, 'quiz-token');
  await expect(page.getByTestId('simulator-chat-user')).toHaveText(message);
  await expect(page.getByTestId('simulator-chat-bot')).toHaveCount(1);
  await expect(page.getByTestId('simulator-chat-bot')).toHaveText(message);
  await expect(page.getByTestId('simulator-chat-bot')).toHaveAttribute('data-chat-id', '24680');
  await page.getByTestId('tutorial-quiz-project').click();
  await expect(page.getByTestId('tutorial-quiz-wrong')).toBeVisible();
  await step(page, 'quiz-token');
  await page.getByTestId('tutorial-quiz-vault').click();
  await completed(page, 'telegram-first-bot');
});


test('конвертеры: F5 сохраняет схему; ошибочный запуск не завершает шаг, исправление помогает', async ({ page }) => {
  await buildConverterLesson(page);
  // Дожидаемся автосохранения через интерфейс, не подменяя документ сторами.
  await expect(page.getByText(/^Сохранено /).first()).toBeVisible();
  await page.reload();
  await step(page, 'run');
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await page.getByTestId('tutorial-collapse').click();
  await page.getByTestId('canvas-node-core.text').click();
  const value = page.locator('[data-tutorial="inspector"]').getByLabel('Значение', { exact: true });
  await expect(value).toHaveValue('42');
  await value.fill('не число');
  await page.getByTestId('run-button').click();
  await page.getByTestId('debug-tab-ports').click();
  const conversion = page.getByTestId('debug-node-data.text_to_number');
  await expect(conversion).toHaveAttribute('data-status', 'error');
  await expect(conversion.getByTestId('output-value')).toHaveCount(0);
  await step(page, 'run');
  await expect(page.getByTestId('tutorial-finished')).toHaveCount(0);
  // Возвращаемся в симулятор до успешного запуска: затем нужно самим открыть «Порты».
  await page.getByTestId('debug-tab-simulator').click();
  await value.fill('42');
  await page.getByTestId('run-button').click();
  await step(page, 'debug');
  await page.getByTestId('debug-tab-ports').click();
  await expect(conversion).toHaveAttribute('data-status', 'success');
  await expect(conversion.getByTestId('output-value')).toHaveText('42');
  await completed(page, 'data-converters');
});
