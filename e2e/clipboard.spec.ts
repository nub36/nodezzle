/** 08A: копируется фрагмент целиком, а не отдельные узлы в случайные места. */
import { expect, test, type Page } from '@playwright/test';
import { connectPorts, moveNode, port } from './helpers';

async function graph(page: Page) {
  await page.goto('/#/dashboard');
  await page.getByTestId('onboarding-skip').click();
  await page.getByTestId('create-project').click();
  await page.getByTestId('library-search').fill('core.text');
  await page.getByTestId('library-item-core.text').click();
  const text = page.getByTestId('canvas-node-core.text');
  await page.locator('[data-tutorial="inspector"]').getByLabel('Значение', { exact: true }).fill('Копия: 42');
  await page.getByTestId('library-search').fill('debug.log');
  await page.getByTestId('library-item-debug.log').click();
  const log = page.getByTestId('canvas-node-debug.log');
  await moveNode(page, log, 760, 350);
  await moveNode(page, text, 380, 200);
  await connectPorts(page, port(text, 'output', 'text'), port(log, 'input', 'value'));
  await text.click();
  await log.click({ modifiers: ['Control'] });
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  return { text, log };
}

async function points(page: Page, selected = false) {
  return page.locator(`.react-flow__node${selected ? '.selected' : ''}`).evaluateAll((nodes) => nodes.map((node) => {
    const matrix = new DOMMatrixReadOnly((node as HTMLElement).style.transform);
    return { id: node.getAttribute('data-id')!, x: matrix.m41, y: matrix.m42,
      type: node.querySelector('[data-testid^="canvas-node-"]')?.getAttribute('data-testid') };
  }));
}

async function noOverlap(page: Page) {
  await expect.poll(async () => page.locator('.react-flow__node').evaluateAll((nodes) => {
    const boxes = nodes.map((n) => n.getBoundingClientRect());
    return boxes.some((a, i) => boxes.slice(i + 1).some((b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1));
  })).toBe(false);
}

async function assertFragment(page: Page, originals: Awaited<ReturnType<typeof points>>) {
  const copies = await points(page, true);
  expect(copies).toHaveLength(2);
  const deltas = copies.map((n) => {
    const original = originals.find((o) => o.type === n.type)!;
    expect(n.id).not.toBe(original.id);
    return { x: n.x - original.x, y: n.y - original.y };
  });
  expect(deltas[0].x).toBeCloseTo(deltas[1].x, 5);
  expect(deltas[0].y).toBeCloseTo(deltas[1].y, 5);
  const all = await points(page);
  for (const original of originals) expect(all.find((n) => n.id === original.id)).toEqual(original);
  await noOverlap(page);
  const library = (await page.locator('[data-tutorial="library"]').boundingBox())!;
  const inspector = (await page.locator('[data-tutorial="inspector"]').boundingBox())!;
  const canvas = (await page.locator('[data-tutorial="canvas"]').boundingBox())!;
  for (const node of await page.locator('.react-flow__node.selected').all()) {
    const box = (await node.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(library.x + library.width);
    expect(box.x + box.width).toBeLessThanOrEqual(inspector.x);
    expect(box.y).toBeGreaterThanOrEqual(canvas.y);
    expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height);
  }
}

test('дублирование фрагмента: относительные позиции, связь, старые координаты, undo/redo/F5', async ({ page }) => {
  await graph(page);
  const originals = await points(page);
  await page.keyboard.press('Control+d');
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await assertFragment(page, originals);
  const saved = await points(page);
  await page.getByTitle('Отменить (Ctrl+Z)').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.getByTitle('Повторить (Ctrl+Shift+Z)').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  expect(await points(page)).toEqual(saved);
  await page.getByTestId('run-button').click();
  await page.getByTestId('debug-tab-ports').click();
  await expect(page.getByTestId('debug-node-debug.log').getByTestId('input-value')).toHaveText(['"Копия: 42"', '"Копия: 42"']);
  await expect(page.getByText(/^Сохранено /).first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  expect(await points(page)).toEqual(saved);
  await noOverlap(page);

});

test('буфер: независимый снимок настроек, повторная вставка при масштабе и открытой отладке', async ({ page }) => {
  const { text } = await graph(page);
  const originals = await points(page);
  await page.keyboard.press('Control+c');
  await text.click();
  await page.locator('[data-tutorial="inspector"]').getByLabel('Значение', { exact: true }).fill('Исходник изменён');
  await text.click(); // убрать фокус с поля: Ctrl+V должен вставить детали, а не текст
  await expect(page.getByTestId('debug-tab-ports')).toBeVisible(); // отладка открыта по умолчанию
  await page.getByTitle('Приблизить').click();
  await page.keyboard.press('Control+v');
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await assertFragment(page, originals);
  await page.keyboard.press('Control+v');
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  await expect(page.locator('.react-flow__edge')).toHaveCount(3);
  await assertFragment(page, originals);
  await page.getByTestId('run-button').click();
  await page.getByTestId('debug-tab-ports').click();
  await expect(page.getByTestId('debug-node-debug.log').getByTestId('input-value')).toHaveText(['"Исходник изменён"', '"Копия: 42"', '"Копия: 42"']);
  const saved = await points(page);
  await page.getByTitle('Отменить (Ctrl+Z)').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await page.getByTitle('Повторить (Ctrl+Shift+Z)').click();
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  expect(await points(page)).toEqual(saved);
  await expect(page.getByText(/^Сохранено /).first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  await expect(page.locator('.react-flow__edge')).toHaveCount(3);
  expect(await points(page)).toEqual(saved);
  await noOverlap(page);
});

test('контекстное меню: дублируется выбранный фрагмент, а не только один узел', async ({ page }) => {
  const { log } = await graph(page);
  const originals = await points(page);
  await log.click({ button: 'right' });
  await page.getByRole('button', { name: 'Дублировать', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await assertFragment(page, originals);
});

test('правый клик по невыделенной детали меняет цель копирования; ввод текста не перехватывается', async ({ page }) => {
  const { text, log } = await graph(page);
  await page.locator('.react-flow__pane').click({ position: { x: 650, y: 60 } });
  await text.click();
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  await log.click({ button: 'right' });
  await page.getByRole('button', { name: 'Копировать', exact: true }).click();
  await page.keyboard.press('Meta+v');
  await expect(page.getByTestId('canvas-node-core.text')).toHaveCount(1);
  await expect(page.getByTestId('canvas-node-debug.log')).toHaveCount(2);
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1); // внешняя связь не скопирована
  await noOverlap(page);
  await page.getByTestId('library-search').focus();
  await page.keyboard.press('Control+d');
  await page.keyboard.press('Control+v');
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
});
