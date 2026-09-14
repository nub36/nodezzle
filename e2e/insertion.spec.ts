/** 07C: настоящая вставка без ручного раздвигания новых деталей. */
import { expect, test, type Page } from '@playwright/test';
import { moveNode, port } from './helpers';

async function emptyProject(page: Page) {
  await page.goto('/#/dashboard');
  await page.getByTestId('onboarding-skip').click();
  await page.getByTestId('create-project').click();
}

async function add(page: Page, id: string) {
  await page.getByTestId('library-search').fill(id);
  await page.getByTestId(`library-item-${id}`).click();
  return page.getByTestId(`canvas-node-${id}`).last();
}

async function noOverlap(page: Page) {
  await expect.poll(async () => {
    const boxes = await page.locator('.react-flow__node').evaluateAll((nodes) => nodes.map((n) => {
      const b = n.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    }));
    return boxes.some((a, i) => boxes.slice(i + 1).some((b) =>
      a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.y < b.y + b.h - 1 && a.y + a.h > b.y + 1));
  }).toBe(false);
}

async function positions(page: Page) {
  return page.locator('.react-flow__node').evaluateAll((nodes) => Object.fromEntries(nodes.map((n) => [n.getAttribute('data-id'), (n as HTMLElement).style.transform])));
}

test('вставка: разные высоты, неизменные старые позиции, undo/redo и F5', async ({ page }) => {
  await emptyProject(page);
  const first = await add(page, 'core.text');
  await moveNode(page, first, 410, 190);
  for (const id of ['telegram.message_received', 'debug.log', 'logic.condition', 'telegram.send_message', 'core.text']) {
    const before = await positions(page);
    await add(page, id);
    await noOverlap(page);
    const after = await positions(page);
    for (const [key, value] of Object.entries(before)) expect(after[key]).toBe(value);
  }
  const saved = await positions(page);
  await page.getByTitle('Отменить (Ctrl+Z)').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
  await page.getByTitle('Повторить (Ctrl+Shift+Z)').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  expect(await positions(page)).toEqual(saved);
  await expect(page.getByText(/^Сохранено /).first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  expect(await positions(page)).toEqual(saved);
  await noOverlap(page);
});

test('вставка при масштабе и открытой отладке остаётся между панелями', async ({ page }) => {
  await emptyProject(page);
  await add(page, 'core.text');
  await page.getByTestId('debug-toggle').click();
  await page.getByTitle('Приблизить').click();
  for (const id of ['telegram.message_received', 'logic.condition', 'debug.log', ...Array<string>(8).fill('telegram.message_received')]) {
    const before = await positions(page);
    const node = await add(page, id);
    await noOverlap(page);
    const after = await positions(page);
    for (const [key, value] of Object.entries(before)) expect(after[key]).toBe(value);
    await expect.poll(async () => {
      const n = (await node.boundingBox())!;
      const library = (await page.getByTestId('library-search').boundingBox())!;
      const inspector = (await page.locator('[data-tutorial="inspector"]').boundingBox())!;
      const canvas = (await page.locator('[data-tutorial="canvas"]').boundingBox())!;
      return n.x >= library.x + library.width && n.x + n.width <= inspector.x &&
        n.y >= canvas.y && n.y + n.height <= canvas.y + canvas.height;
    }).toBe(true);
  }
});


test('перетаскивание из библиотеки: точка курсора и обход занятого места', async ({ page }) => {
  await emptyProject(page);
  await add(page, 'core.text');
  const canvas = page.locator('[data-tutorial="canvas"]');
  const area = (await canvas.boundingBox())!;
  await page.getByTestId('library-search').fill('debug.log');
  const source = page.getByTestId('library-item-debug.log');
  const before = await positions(page);
  await source.dragTo(canvas, { targetPosition: { x: 810 - area.x, y: 160 - area.y } });
  const log = page.getByTestId('canvas-node-debug.log');
  await expect(log).toHaveCount(1);
  const box = (await log.boundingBox())!;
  expect(Math.abs(box.x - 810)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y - 160)).toBeLessThanOrEqual(1);
  await source.dragTo(canvas, { targetPosition: { x: 810 - area.x, y: 160 - area.y } });
  await expect(log).toHaveCount(2);
  await noOverlap(page);
  const after = await positions(page);
  for (const [id, point] of Object.entries(before)) expect(after[id]).toBe(point);
});

test('быстрая вставка от порта: свободная позиция и работающая связь', async ({ page }) => {
  await emptyProject(page);
  const text = await add(page, 'core.text');
  await page.locator('[data-tutorial="inspector"]').getByLabel('Значение', { exact: true }).fill('Быстрая вставка: 42');
  const start = (await port(text, 'output', 'text').boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(900, 450, { steps: 15 });
  await page.mouse.up();
  await page.getByTestId('quick-insert-menu').getByRole('button', { name: 'Лог', exact: true }).click();
  await expect(page.getByTestId('canvas-node-debug.log')).toHaveCount(1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await noOverlap(page);
  await page.getByTestId('run-button').click();
  await page.getByTestId('debug-tab-ports').click();
  await expect(page.getByTestId('debug-node-debug.log').getByTestId('input-value')).toHaveText('"Быстрая вставка: 42"');
});
