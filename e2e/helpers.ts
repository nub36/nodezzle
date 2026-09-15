import { expect, type Locator, type Page } from '@playwright/test';

/** Расставляем детали пользовательским перетаскиванием, не меняя сторы.
 * Учебным сценариям нужна фиксированная раскладка независимо от поиска
 * свободного места при вставке. Координаты здесь — в экранных пикселях. */
export async function moveNode(page: Page, node: Locator, x: number, y: number): Promise<void> {
  const box = await node.boundingBox();
  if (box === null) throw new Error('Деталь не видна на холсте');
  await page.mouse.move(box.x + 30, box.y + 16);
  await page.mouse.down();
  await page.mouse.move(x + 30, y + 16, { steps: 12 });
  await page.mouse.up();
}

export async function arrangePair(page: Page, source: Locator, target: Locator): Promise<void> {
  await moveNode(page, target, 810, 390);
  await moveNode(page, source, 400, 180);
}

/** Соединение конкретных портов через настоящий drag, без подмены состояния. */
export async function connectPorts(page: Page, from: Locator, to: Locator): Promise<void> {
  await from.scrollIntoViewIfNeeded();
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error('Порт недоступен для соединения');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 18, a.y + a.height / 2, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
}

export function port(node: Locator, direction: 'input' | 'output', id: string): Locator {
  return node.locator(`[data-port-direction="${direction}"][data-port-id="${id}"]`);
}

/** Панель результата теперь свёрнута при первом открытии редактора. */
export async function openResult(page: Page): Promise<void> {
  await expect(page.getByTestId('run-button')).toBeVisible();
  if (!await page.getByTestId('debug-tab-simulator').isVisible()) await page.getByTestId('debug-toggle').click();
}
export async function openTools(page: Page): Promise<void> {
  if (!await page.getByTestId('effects-mode').isVisible()) await page.getByTestId('toolbar-tools-toggle').click();
}
