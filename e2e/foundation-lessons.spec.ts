import { openResult } from './helpers';
/** 07B4: последние четыре урока. Целевой прогресс не задаётся фикстурами. */
import { expect, test, type Page } from '@playwright/test';
import { add, completed, openLesson, step } from './lesson-helpers';
import { arrangePair, connectPorts, port } from './helpers';

const basics = ['intro-what', 'intro-canvas', 'basics-ports'];

async function readStep(page: Page, id: string) {
  await step(page, id);
  await page.getByTestId('tutorial-ack').click();
}

async function quiz(page: Page, id: string, wrong: string, right: string) {
  await step(page, id);
  await page.getByTestId(`tutorial-quiz-${wrong}`).click();
  await step(page, id);
  await expect(page.getByTestId('tutorial-quiz-wrong')).toBeVisible();
  await page.getByTestId(`tutorial-quiz-${right}`).click();
}

test('знакомство: оба объяснения, неверные ответы, F5 и завершение без проекта', async ({ page }) => {
  await openLesson(page, 'intro-what');
  await step(page, 'about');
  const details = page.getByTestId('tutorial-card').getByTestId('lesson-step-details');
  await details.locator('summary').click();
  await expect(details).toContainText('само по себе оно не запускает схему');
  await readStep(page, 'about');
  await expect(details).not.toHaveAttribute('open');
  await readStep(page, 'how');
  await page.reload();
  await step(page, 'quiz-input');
  await quiz(page, 'quiz-input', 'output', 'input');
  await quiz(page, 'quiz-flow', 'nothing', 'connections');
  await completed(page, 'intro-what');
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('nodezzle.project.')))).toEqual([]);
});

test('порты: реальные входы/выходы, квадрат ошибки и совместимость до запуска', async ({ page }) => {
  await openLesson(page, 'basics-ports', ['intro-what', 'intro-canvas']);
  await readStep(page, 'about-ports');
  const sender = await add(page, 'telegram.send_message');
  await step(page, 'add-value');
  const text = await add(page, 'core.text');
  await step(page, 'shapes');
  await arrangePair(page, text, sender);
  await expect(sender.locator('[data-port-direction="input"]')).toHaveCount(3);
  await expect(port(sender, 'input', 'keyboard')).toHaveAttribute('aria-label', /Объект/);
  await expect(text.locator('[data-port-direction="input"]')).toHaveCount(0);
  await expect(port(sender, 'input', 'chat_id')).toHaveAttribute('aria-label', /Число/);
  await expect(port(text, 'output', 'text')).toHaveAttribute('aria-label', /Текст/);
  await expect(port(sender, 'output', 'error')).toHaveClass(/nzz-handle--error/);
  await expect(port(text, 'output', 'text')).not.toHaveClass(/nzz-handle--error|nzz-handle--event/);
  // Текст нельзя подключить к числовому ID чата, но можно к текстовому входу.
  await connectPorts(page, port(text, 'output', 'text'), port(sender, 'input', 'chat_id'));
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await connectPorts(page, port(text, 'output', 'text'), port(sender, 'input', 'text'));
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await step(page, 'shapes');
  await page.reload();
  await step(page, 'shapes');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await readStep(page, 'shapes');
  await quiz(page, 'quiz-error', 'diamond', 'square');
  await completed(page, 'basics-ports');
});

async function buildChain(page: Page) {
  await openLesson(page, 'basics-chain', basics);
  await step(page, 'add-trigger');
  const trigger = await add(page, 'telegram.message_received');
  await step(page, 'add-log');
  const log = await add(page, 'debug.log');
  await step(page, 'connect');
  await arrangePair(page, trigger, log);
  await connectPorts(page, port(trigger, 'output', 'chat_id'), port(log, 'input', 'value'));
  await step(page, 'connect');
  await page.getByTitle('Отменить (Ctrl+Z)').click();
  await connectPorts(page, port(trigger, 'output', 'text'), port(log, 'input', 'value'));
  await step(page, 'run');
  return { trigger, log };
}

test('первая цепочка: точный текст в портах и журнале, просмотр не пропускается', async ({ page }) => {
  await buildChain(page);
  await page.reload();
  await step(page, 'run');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  const message = 'Первый запуск: привет, 42!';
  await page.getByLabel('Текст сообщения', { exact: true }).fill(message);
  await page.getByTestId('run-button').click();
  await step(page, 'debug');
  await openResult(page);
  await page.getByTestId('debug-tab-ports').click();
  await expect(page.getByTestId('debug-node-telegram.message_received').getByTestId('output-text')).toHaveText(JSON.stringify(message));
  await expect(page.getByTestId('debug-node-debug.log').getByTestId('input-value')).toHaveText(JSON.stringify(message));
  await step(page, 'debug');
  await openResult(page);
  await page.getByTestId('debug-tab-log').click();
  await expect(page.getByTestId('execution-log-entry')).toContainText([message]);
  await completed(page, 'basics-chain');
});

test('первая цепочка: запуск без передачи в лог не завершает шаг, исправление помогает', async ({ page }) => {
  const { trigger, log } = await buildChain(page);
  await page.getByTitle('Отменить (Ctrl+Z)').click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await page.getByTestId('run-button').click();
  await openResult(page);
  await page.getByTestId('debug-tab-ports').click();
  await expect(page.getByTestId('debug-node-telegram.message_received')).toHaveAttribute('data-status', 'success');
  await step(page, 'run');
  await connectPorts(page, port(trigger, 'output', 'text'), port(log, 'input', 'value'));
  await page.getByTestId('tutorial-recheck').click();
  await step(page, 'run');
  await page.getByTestId('run-button').click();
  await step(page, 'debug');
  await openResult(page);
  await page.getByTestId('debug-tab-log').click();
  await completed(page, 'basics-chain');
});

test('публикация: только теория, без изменения рабочего проекта и запросов записи', async ({ page }) => {
  const writes: string[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      writes.push(`${request.method()} ${request.url()}`);
      await route.abort(); // Даже при регрессии тест не должен ничего публиковать.
    } else await route.continue();
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('working-project-seeded')) return;
    localStorage.setItem('nodezzle.project.working', JSON.stringify({
      formatVersion: 1, id: 'working', name: 'Рабочая схема — не менять', kind: 'empty',
      canvas: { id: 'canvas', name: 'Холст', nodes: [{ id: 'text', blockId: 'core.text', position: { x: 40, y: 80 }, config: { value: 'Сохранить без изменений' } }], edges: [] },
      models: [], variables: [], meta: { createdAt: 1, updatedAt: 1 },
    }));
    sessionStorage.setItem('working-project-seeded', '1');
  });
  await openLesson(page, 'publish-versions', ['debug-why-not-working']);
  const before = await page.evaluate(() => localStorage.getItem('nodezzle.project.working'));
  await expect(page).toHaveURL(/#\/academy\?lesson=publish-versions/);
  await expect(page.locator('[data-tutorial="canvas"]')).toHaveCount(0);
  await readStep(page, 'about');
  await page.getByTestId('tutorial-card').getByTestId('lesson-step-details').locator('summary').click();
  await expect(page.getByTestId('tutorial-card')).toContainText('Не путайте визуальный режим с фактической публикацией');
  await readStep(page, 'modes');
  await page.reload();
  await step(page, 'preview');
  await expect(page.getByTestId('tutorial-card')).toContainText('не публикует');
  await readStep(page, 'preview');
  await quiz(page, 'quiz-live', 'always', 'frozen');
  await completed(page, 'publish-versions');
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('nodezzle.project.working'))).toBe(before);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('nodezzle.project.')))).toEqual(['nodezzle.project.working']);
});
