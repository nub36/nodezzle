import type { Locator, Page } from '@playwright/test';

/** Расставляем детали пользовательским перетаскиванием, не меняя сторы.
 * При вставке в центр они могут перекрывать друг друга: сначала двигаем
 * последнюю (верхнюю), затем первую. Координаты в экранных пикселях. */
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
