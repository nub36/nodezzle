import { test, expect, type Page } from '@playwright/test';
import { openTools } from './helpers';

async function create(page: Page) {
  await page.goto('/#/');
  await page.getByTestId('site-header').locator('summary:visible').click();
  await page.locator('[data-site-menu][open]').getByRole('link', { name: 'Проекты', exact: true }).click();
  await page.getByTestId('onboarding-skip').click();
  await page.getByTestId('create-simple-project').click();
  await page.getByTestId('simple-create-telegram').click();
  await expect(page.getByTestId('simple-editor')).toBeVisible();
}
async function assemble(page: Page, text = 'Привет!') {
  await page.getByTestId('simple-add-telegram.message_received').click();
  await page.getByTestId('simple-next-reply').click();
  await page.getByTestId('simple-reply-text').fill(text);
  await page.getByTestId('simple-connect').click();
}
async function check(page: Page, text = 'Добрый день') {
  await page.getByLabel('Сообщение пользователя', { exact: true }).fill(text);
  await page.getByTestId('simple-check').click();
}
// Только чтение после реальных действий UI. Готовый JSON в хранилище не записываем.
async function stored(page: Page, id: string) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(`nodezzle.project.${key}`)!), id);
}
async function saved(page: Page) { await expect(page.locator('.simple-save')).toHaveText('Сохранено в браузере'); }

for (const width of [1440, 390]) test(`первый бот ${width}: UI → ответ → PRO → Simple → F5, тот же документ`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await create(page); await assemble(page); await check(page);
  await expect(page.locator('.phone-bubble--bot')).toHaveText(/Привет!/);
  await expect(page.locator('.phone-bubble--bot')).not.toContainText('Добрый день');
  await saved(page);
  const id = (await page.getByTestId('simple-editor').getAttribute('data-project-id'))!;
  const before = await stored(page, id);
  expect(before.canvas.nodes.map((n: { blockId: string }) => n.blockId)).toEqual(['telegram.message_received', 'telegram.send_message']);
  expect(before.canvas.nodes[1].config.replyText).toBe('Привет!');
  expect(before.canvas.edges).toHaveLength(1);
  expect(before.canvas.edges[0]).toMatchObject({ source: before.canvas.nodes[0].id, sourcePort: 'chat_id', target: before.canvas.nodes[1].id, targetPort: 'chat_id' });
  await page.getByTestId('editor-mode-switch').click();
  await expect(page).toHaveURL(new RegExp(`/projects/${id}$`));
  await expect(page.getByTestId('canvas-node-telegram.send_message')).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await openTools(page); await page.getByTestId('editor-mode-switch').click();
  await expect(page).toHaveURL(new RegExp(`/build/${id}$`));
  await expect(page.getByTestId('simple-reply-text')).toHaveValue('Привет!');
  await page.reload();
  await expect(page.getByTestId('simple-reply-text')).toHaveValue('Привет!');
  expect((await stored(page, id)).canvas).toEqual(before.canvas);
  await check(page); await expect(page.locator('.phone-bubble--bot')).toHaveText(/Привет!/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  if (width === 1440) await page.screenshot({ path: '/home/user/simple-editor.png', fullPage: true });
});

test('не хватает текста/связи: объяснение, исправление, undo/redo и настоящий повтор', async ({ page }) => {
  await create(page);
  await page.getByTestId('simple-add-telegram.message_received').click();
  await page.getByTestId('simple-next-reply').click();
  await check(page);
  await expect(page.getByRole('alert')).toContainText('Напишите текст ответа');
  await expect(page.getByRole('alert')).toContainText('Свяжите ответ с событием');
  await expect(page.locator('.phone-bubble--bot')).toHaveCount(0);
  await page.getByTestId('simple-undo').click();
  await expect(page.getByTestId('simple-node-telegram.send_message')).toHaveCount(0);
  await page.getByTestId('simple-redo').click();
  await page.getByTestId('simple-reply-text').fill('Исправлено');
  await page.getByTestId('simple-connect').click();
  await page.getByTestId('simple-undo').click();
  await expect(page.getByTestId('simple-connect')).toBeVisible();
  await page.getByTestId('simple-redo').click();
  await expect(page.getByTestId('simple-connection')).toHaveCount(1);
  await check(page); await expect(page.locator('.phone-bubble--bot')).toHaveText(/Исправлено/);
  await page.getByTestId('simple-reply-text').fill('Новый ответ');
  await expect(page.locator('.phone-bubble--bot')).toHaveCount(0);
  await check(page); await expect(page.locator('.phone-bubble--bot')).toHaveText(/Новый ответ/);
});

test('добавленная в PRO расширенная деталь остаётся в том же проекте, Simple только читает', async ({ page }) => {
  await create(page); await assemble(page);
  const id = (await page.getByTestId('simple-editor').getAttribute('data-project-id'))!;
  await page.getByTestId('editor-mode-switch').click();
  await page.getByTestId('library-search').fill('logic.condition');
  await page.getByTestId('library-item-logic.condition').click();
  await openTools(page); await page.getByTestId('editor-mode-switch').click();
  await expect(page.locator('.simple-warning')).toContainText('расширенные возможности');
  await expect(page.getByTestId('simple-node-logic.condition')).toBeVisible();
  await expect(page.getByTestId('simple-reply-text')).toHaveCount(0);
  const before = await stored(page, id);
  await page.reload(); await expect(page.getByTestId('simple-node-logic.condition')).toBeVisible();
  await page.getByTestId('editor-mode-switch').click();
  await expect(page.getByTestId('canvas-node-logic.condition')).toBeVisible();
  expect((await stored(page, id)).canvas).toEqual(before.canvas);
});

test('ошибка сохранения не разрешает переход с потерей правок', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('nodezzle.project.') && document.documentElement.dataset.failSave === 'true') throw new DOMException('quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await create(page); await assemble(page); await saved(page);
  await page.evaluate(() => { document.documentElement.dataset.failSave = 'true'; });
  await page.getByTestId('simple-reply-text').fill('Нельзя потерять');
  await page.getByTestId('editor-mode-switch').click();
  await expect(page).toHaveURL(/\/build\//);
  await expect(page.getByTestId('simple-reply-text')).toHaveValue('Нельзя потерять');
  await expect(page.locator('.simple-save')).toHaveText('Не удалось сохранить');
  await page.getByRole('link', { name: 'Проекты', exact: true }).click();
  await expect(page.getByTestId('simple-reply-text')).toHaveValue('Нельзя потерять');
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.evaluate(() => { delete document.documentElement.dataset.failSave; });
  await page.getByRole('button', { name: 'Сохранить ещё раз' }).click();
  await saved(page); await page.reload();
  await expect(page.getByTestId('simple-reply-text')).toHaveValue('Нельзя потерять');
});

test('Web использует существующий текст и настоящий WebPreview', async ({ page }) => {
  await page.goto('/#/build');
  await page.getByTestId('simple-create-web').click();
  await page.getByTestId('simple-add-web.text').click();
  await page.getByLabel('Текст', { exact: true }).fill('Моя первая страница');
  await page.getByTestId('simple-check').click();
  await expect(page.getByTestId('simple-result')).toContainText('Проверка завершена');
  await expect(page.locator('.simple-test')).toContainText('Моя первая страница');
});

test('старый демонстрационный проект с моделью читается без изменений и возвращается в PRO', async ({ page }) => {
  await page.goto('/#/dashboard');
  await page.getByTestId('onboarding-skip').click();
  await page.getByRole('button', { name: /Загрузить пример: Telegram-бот/ }).click();
  await expect(page.getByTestId('canvas-node-models.call')).toBeVisible();
  const id = page.url().split('/').at(-1)!;
  const before = await stored(page, id);
  // Штатный seed из 0.5.51, не подготовка JSON тестом. У ответа ещё нет replyText.
  expect(before.canvas.nodes.find((n: { blockId: string }) => n.blockId === 'telegram.send_message').config).toEqual({});
  await openTools(page); await page.getByTestId('editor-mode-switch').click();
  await expect(page.locator('.simple-warning')).toContainText('расширенные возможности');
  await expect(page.getByTestId('simple-node-models.call')).toBeVisible();
  await page.reload(); await expect(page.getByTestId('simple-node-models.call')).toBeVisible();
  await page.getByTestId('editor-mode-switch').click();
  await expect(page.getByTestId('canvas-node-models.call')).toBeVisible();
  const after = await stored(page, id);
  expect(after.canvas).toEqual(before.canvas); expect(after.models).toEqual(before.models);
});

test('/start: не отвечает на обычный текст, отвечает на нужную команду', async ({ page }) => {
  await create(page);
  await page.getByTestId('simple-add-telegram.command').click();
  await page.getByTestId('simple-next-reply').click();
  await page.getByTestId('simple-reply-text').fill('Добро пожаловать');
  await page.getByTestId('simple-connect').click();
  await check(page, 'привет');
  await expect(page.getByTestId('simple-result')).toContainText('Ответа нет');
  await expect(page.locator('.phone-bubble--bot')).toHaveCount(0);
  await check(page, '/start');
  await expect(page.locator('.phone-bubble--bot')).toHaveText(/Добро пожаловать/);
});

test('правка поддержанной настройки в PRO возвращается в редактируемый Simple', async ({ page }) => {
  await create(page); await assemble(page);
  await page.getByTestId('editor-mode-switch').click();
  await page.getByTestId('canvas-node-telegram.send_message').locator('.node-heading').click();
  await page.getByLabel('Текст ответа без подключённого входа', { exact: true }).fill('Изменено в PRO');
  await openTools(page); await page.getByTestId('editor-mode-switch').click();
  await expect(page.getByTestId('simple-reply-text')).toHaveValue('Изменено в PRO');
  await check(page); await expect(page.locator('.phone-bubble--bot')).toHaveText(/Изменено в PRO/);
});

test('пустая схема не подменяется Telegram-ботом или готовым шаблоном', async ({ page }) => {
  await page.goto('/#/build'); await page.getByTestId('simple-create-empty').click();
  await expect(page.getByRole('heading', { name: 'Что должна делать ваша схема?' })).toBeVisible();
  await expect(page.locator('.simple-node')).toHaveCount(0);
  await page.getByTestId('simple-add-core.text').click();
  await page.getByLabel('Текст', { exact: true }).fill('Заготовка');
  await saved(page); await page.reload();
  await expect(page.getByLabel('Текст', { exact: true })).toHaveValue('Заготовка');
  await expect(page.getByTestId('simple-check')).toHaveCount(0);
});
