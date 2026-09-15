import { openTools } from './helpers';
import { openResult } from './helpers';
/** Поправки владельца: окно мешало проводу, проверка была немой, Escape закрывал урок. */
import { expect, test, type Page } from '@playwright/test';
const lessonIds = ['intro-what', 'intro-canvas', 'basics-ports', 'basics-chain', 'logic-condition', 'data-converters', 'telegram-first-bot', 'telegram-command', 'web-first-page', 'models-first-model', 'debug-why-not-working', 'publish-versions'];
import { add, completed, openLesson, step } from './lesson-helpers';
import { connectPorts, moveNode, port } from './helpers';

async function moveCard(page: Page, x: number, y: number) {
  const card = (await page.getByTestId('tutorial-card').boundingBox())!;
  const handle = (await page.getByTestId('tutorial-drag').boundingBox())!;
  const start = { x: handle.x + 12, y: handle.y + handle.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + x - card.x, start.y + y - card.y, { steps: 12 });
  await page.mouse.up();
}

test('первая цепочка: неверный порт, лишняя деталь, быстрая вставка, провод сквозь окно и завершение', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLesson(page, 'basics-chain', ['intro-what', 'intro-canvas', 'basics-ports']);
  const trigger = await add(page, 'telegram.message_received');
  const log = await add(page, 'debug.log');
  await step(page, 'connect');
  // Как на скриншоте: лишняя деталь не должна ломать проверку нужной пары.
  await add(page, 'security.mask');
  await openTools(page);
  await page.getByTitle('Приблизить').click();
  await openTools(page);
  await page.getByTitle('Приблизить').click();
  await moveNode(page, log, 720, 390);
  await moveNode(page, trigger, 340, 160);
  await connectPorts(page, port(trigger, 'output', 'user_id'), port(log, 'input', 'value'));
  await step(page, 'connect');
  await page.getByTestId('tutorial-recheck').click();
  await expect(page.getByTestId('tutorial-check-result')).toContainText('выход «Текст»');
  await expect(page.getByTestId('tutorial-check-result')).toContainText('вход «Значение»');
  await page.getByTitle('Отменить (Ctrl+Z)').click();
  // Отпускание в пустоту открывает меню; Escape закрывает только меню, не урок.
  const source = (await port(trigger, 'output', 'text').boundingBox())!;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(690, 330, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId('quick-insert-menu')).toBeVisible();
  let dialogs = 0;
  page.on('dialog', async (dialog) => { dialogs++; await dialog.dismiss(); });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('quick-insert-menu')).toBeHidden();
  expect(dialogs).toBe(0);
  await trigger.click({ button: 'right' });
  await expect(page.getByRole('button', { name: 'Дублировать', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Дублировать', exact: true })).toBeHidden();
  expect(dialogs).toBe(0);
  await step(page, 'connect');
  // Намеренно накрываем вход карточкой: провод должен попасть в настоящий порт под ней.
  const input = (await port(log, 'input', 'value').boundingBox())!;
  await moveCard(page, input.x - 40, input.y - 130);
  const box = (await page.getByTestId('tutorial-card').boundingBox())!;
  expect(input.x).toBeGreaterThan(box.x);
  expect(input.y).toBeGreaterThan(box.y);
  expect(input.y).toBeLessThan(box.y + box.height);
  await connectPorts(page, port(trigger, 'output', 'text'), port(log, 'input', 'value'));
  await step(page, 'run');
  await expect(page.getByTestId('quick-insert-menu')).toBeHidden();
  await expect(page.getByTestId('tutorial-check-result')).toBeHidden();
  // Перенос переживает смену шага и F5, проверка не теряет соединение.
  const moved = (await page.getByTestId('tutorial-card').boundingBox())!;
  await page.reload();
  await step(page, 'run');
  const restored = (await page.getByTestId('tutorial-card').boundingBox())!;
  expect(restored.x).toBeCloseTo(moved.x, 0);
  expect(restored.y).toBeCloseTo(moved.y, 0);
  await page.getByLabel('Текст сообщения', { exact: true }).fill('Исправлено: 42');
  await page.getByTestId('run-button').click();
  await step(page, 'debug');
  await openResult(page);
  await page.getByTestId('debug-tab-log').click();
  await expect(page.getByTestId('execution-log-entry')).toContainText(['Исправлено: 42']);
  await completed(page, 'basics-chain');
});

test('окно: клавиатура, ограничение экраном при resize, сворачивание и сброс позиции', async ({ page }) => {
  await openLesson(page, 'intro-what');
  const card = page.getByTestId('tutorial-card');
  const before = (await card.boundingBox())!;
  await page.getByTestId('tutorial-drag').focus();
  await page.keyboard.press('ArrowLeft');
  expect((await card.boundingBox())!.x).toBe(before.x - 16);
  await page.keyboard.press('Shift+ArrowDown');
  expect((await card.boundingBox())!.y).toBe(before.y + 48);
  await page.getByTestId('tutorial-ack').click();
  await step(page, 'how');
  await page.setViewportSize({ width: 390, height: 640 });
  await expect.poll(async () => {
    const box = (await card.boundingBox())!;
    return box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 640;
  }).toBe(true);
  await page.getByTestId('tutorial-collapse').click();
  await moveCard(page, -500, -500);
  expect((await card.boundingBox())!.x).toBe(8);
  expect((await card.boundingBox())!.y).toBe(8);
  await page.getByTestId('tutorial-reset-position').click();
  expect((await card.boundingBox())!.y).toBe(64);
  await step(page, 'how');
});

// Каждый урок получает именно своё окно; прогресс целевого урока не подменяется.
for (const [index, lessonId] of lessonIds.entries()) {
  test(`окно и ручная проверка не блокируют урок ${lessonId}`, async ({ page }) => {
    await openLesson(page, lessonId, lessonIds.slice(0, index));
    const card = page.getByTestId('tutorial-card');
    const initialStep = await card.getAttribute('data-step-id');
    await moveCard(page, 330, 90);
    const moved = (await card.boundingBox())!;
    expect(moved.x).toBeCloseTo(330, 0);
    expect(moved.y).toBeCloseTo(90, 0);
    await expect(card).toHaveAttribute('data-step-id', initialStep!);
    const recheck = page.getByTestId('tutorial-recheck');
    if (await recheck.isVisible()) {
      await recheck.click();
      await expect(page.getByTestId('tutorial-check-result')).toBeVisible();
      await expect(card).toHaveAttribute('data-step-id', initialStep!);
    }
    await page.reload();
    await expect(card).toHaveAttribute('data-step-id', initialStep!);
    expect((await card.boundingBox())!.x).toBeCloseTo(moved.x, 0);
    await page.getByTestId('tutorial-drag').focus();
    await page.keyboard.press('Home');
    expect((await card.boundingBox())!.y).toBe(64);
  });
}
