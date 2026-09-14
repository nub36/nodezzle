import { expect, test } from '@playwright/test';

test('урок: краткий план, теория по запросу и запуск до списка шагов', async ({ page }) => {
  await page.goto('/#/academy/lesson/intro-what');
  const outline = page.getByTestId('lesson-outline-about');
  await expect(outline).not.toHaveAttribute('open');
  const start = await page.getByTestId('lesson-start').boundingBox();
  const plan = await outline.boundingBox();
  expect(start!.y).toBeLessThan(plan!.y);
  await outline.locator('summary').first().focus();
  await page.keyboard.press('Enter');
  await expect(outline).toHaveAttribute('open');
  const details = outline.getByTestId('lesson-step-details');
  await expect(details).not.toHaveAttribute('open');
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open');
  await expect(details).toContainText('само по себе оно не запускает схему');
});

test('подсказка сворачивается без потери шага, теория следующего шага закрыта', async ({ page }) => {
  await page.goto('/#/academy/lesson/intro-what');
  await page.getByTestId('lesson-start').click();
  const card = page.getByTestId('tutorial-card');
  const details = card.getByTestId('lesson-step-details');
  await details.locator('summary').click();
  await expect(details).toHaveAttribute('open');
  const expanded = await card.boundingBox();
  await page.getByTestId('tutorial-collapse').click();
  await expect(page.getByTestId('tutorial-collapse')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('tutorial-ack')).toBeHidden();
  expect((await card.boundingBox())!.height).toBeLessThan(expanded!.height);
  await expect(card).toHaveAttribute('data-step-id', 'about');
  await page.getByTestId('tutorial-collapse').click();
  await page.getByTestId('tutorial-ack').click();
  await expect(card).toHaveAttribute('data-step-id', 'how');
  await expect(details).not.toHaveAttribute('open');
});

test('Академия и учебная карточка помещаются на узком экране', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto('/#/academy');
  await expect(page.getByTestId('lesson-card-intro-what')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByTestId('lesson-card-intro-what').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByTestId('lesson-start').click();
  await page.getByTestId('tutorial-card').getByTestId('lesson-step-details').locator('summary').click();
  const box = await page.getByTestId('tutorial-card').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(640);
  await page.getByTestId('tutorial-ack').click();
  await expect(page.getByTestId('tutorial-card')).toHaveAttribute('data-step-id', 'how');
});

test('компактные порты: две колонки, независимые маркеры и полные подсказки', async ({ page }) => {
  await page.goto('/#/dashboard');
  await page.getByTestId('onboarding-skip').click();
  await page.getByTestId('create-project').click();
  await page.getByTestId('library-search').fill('data.text_to_number');
  await page.getByTestId('library-item-data.text_to_number').click();
  const node = page.getByTestId('canvas-node-data.text_to_number');
  await expect(node).toBeVisible();
  // Автовписывание не раздувает первую деталь до прежних 220%.
  const box = await node.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(241);
  expect(box!.height).toBeLessThanOrEqual(100);
  const input = node.locator('[data-port-direction="input"]');
  const outputs = node.locator('[data-port-direction="output"]');
  await expect(input).toHaveCount(1);
  await expect(outputs).toHaveCount(2);
  await expect(input).toHaveAttribute('title', 'Текст · Текст');
  await expect(outputs.first()).toHaveAttribute('title', 'Значение · Число');
  const positions = await outputs.evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return { y: r.y, height: r.height, hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el };
  }));
  expect(positions[1]!.y - positions[0]!.y).toBeGreaterThanOrEqual(positions[0]!.height);
  expect(positions.every((p) => p.hit)).toBe(true);
  // Первый вход и первый выход расположены на одной строке.
  expect(Math.abs((await input.boundingBox())!.y - positions[0]!.y)).toBeLessThan(1);
});
