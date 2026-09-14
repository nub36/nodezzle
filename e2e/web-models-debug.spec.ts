/** 07B3: веб-события, содержимое модели и инструменты отладки через UI. */
import { expect, test, type Page } from '@playwright/test';
import { add, completed, startLesson, step } from './lesson-helpers';
import { arrangePair, connectPorts, moveNode, port } from './helpers';

async function textChain(page: Page, lesson: string, value: string) {
  await startLesson(page, lesson, ['data-converters']);
  const text = await add(page, 'core.text');
  await page.locator('[data-tutorial="inspector"]').getByLabel('Значение', { exact: true }).fill(value);
  const log = await add(page, 'debug.log');
  await step(page, 'connect');
  await arrangePair(page, text, log);
  await connectPorts(page, port(text, 'output', 'text'), port(log, 'input', 'value'));
  return { text, log };
}

test('веб: загрузка страницы не запускает кнопку; клик передаёт событие в лог', async ({ page }) => {
  await startLesson(page, 'web-first-page');
  const webPage = await add(page, 'web.page');
  await moveNode(page, webPage, 330, 170);
  const button = await add(page, 'web.button');
  const log = await add(page, 'debug.log');
  await step(page, 'connect');
  await moveNode(page, log, 810, 440);
  await moveNode(page, button, 400, 320);
  await connectPorts(page, port(button, 'output', 'data'), port(log, 'input', 'value'));
  await step(page, 'run-web');
  await page.getByTestId('debug-tab-web').click();
  await page.getByTestId('debug-tab-ports').click();
  await expect(page.getByTestId('debug-node-web.page')).toHaveAttribute('data-status', 'success');
  await expect(page.getByTestId('debug-node-web.button').getByTestId('output-data')).toHaveCount(0);
  await expect(page.getByTestId('debug-node-debug.log').getByTestId('input-value')).toHaveCount(0);
  await step(page, 'run-web');
  await page.getByTestId('debug-tab-web').click();
  await page.locator('[data-tutorial="debug"]').getByRole('button', { name: 'Кнопка', exact: true }).click();
  await step(page, 'debug');
  await page.getByTestId('debug-tab-log').click();
  await step(page, 'debug');
  await page.getByTestId('debug-tab-ports').click();
  const output = page.getByTestId('debug-node-web.button').getByTestId('output-data');
  await expect(output).toContainText('button_click');
  expect(JSON.parse(await output.innerText())).toMatchObject({ event: 'button_click', button: 'Кнопка' });
  expect(JSON.parse(await page.getByTestId('debug-node-debug.log').getByTestId('input-value').innerText())).toEqual(JSON.parse(await output.innerText()));
  await completed(page, 'web-first-page');
});

async function createLessonModel(page: Page) {
  const { text, log } = await textChain(page, 'models-first-model', 'Внутри модели: 73');
  await step(page, 'create-model');
  await page.getByTestId('tutorial-collapse').click();
  await text.click();
  await log.click({ modifiers: ['Control'] });
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await log.click({ button: 'right' });
  await page.getByRole('button', { name: 'Создать модель из выделенного', exact: true }).click();
  await page.getByLabel('Название модели', { exact: true }).fill('Учебная упаковка');
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  await step(page, 'run');
  await expect(page.getByTestId('canvas-node-core.text')).toHaveCount(0);
  await expect(page.getByTestId('canvas-node-debug.log')).toHaveCount(0);
  await expect(page.getByTestId('canvas-node-models.call')).toHaveCount(1);
}

test('модель: упаковка двух деталей, запуск, F5 и спуск внутрь', async ({ page }) => {
  await createLessonModel(page);
  await expect(page.getByText(/^Сохранено /).first()).toBeVisible();
  await page.reload();
  await step(page, 'run');
  await page.getByTestId('run-button').click();
  await step(page, 'drilldown');
  await page.getByTestId('debug-tab-log').click();
  await expect(page.getByTestId('execution-log-entry')).toContainText(['Внутри модели: 73']);
  await page.getByTestId('debug-tab-ports').click();
  await expect(page.getByTestId('debug-node-models.call')).toHaveAttribute('data-status', 'success');
  // Пустой контракт — ожидаемый результат; внутренний лог проверен отдельно.
  await expect(page.getByTestId('debug-node-models.call').getByTestId('output-result')).toHaveText('{}');
  await page.getByTestId('canvas-node-models.call').dblclick();
  await expect(page.getByTestId('canvas-node-core.text')).toHaveCount(1);
  await expect(page.getByTestId('canvas-node-debug.log')).toHaveCount(1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.getByTestId('tutorial-ack').click();
  await step(page, 'quiz-value');
  await page.getByTestId('tutorial-quiz-speed').click();
  await step(page, 'quiz-value');
  await page.getByTestId('tutorial-quiz-reuse').click();
  await completed(page, 'models-first-model');
});

test('отладка: журнал, порты и локальная история — отдельные действия', async ({ page }) => {
  await textChain(page, 'debug-why-not-working', 'Отладка: 123');
  await step(page, 'run');
  await page.getByTestId('run-button').click();
  await step(page, 'open-debug');
  await page.getByTestId('debug-tab-chat').click();
  await step(page, 'open-debug');
  await page.getByTestId('debug-tab-log').click();
  await step(page, 'ports-tab');
  await expect(page.getByTestId('execution-log-entry')).toContainText(['Отладка: 123']);
  await page.getByTestId('tutorial-recheck').click();
  await step(page, 'ports-tab');
  await page.getByTestId('debug-tab-ports').click();
  await step(page, 'history-tab');
  await expect(page.getByTestId('debug-node-core.text').getByTestId('output-text')).toHaveText('"Отладка: 123"');
  await expect(page.getByTestId('debug-node-debug.log').getByTestId('input-value')).toHaveText('"Отладка: 123"');
  await page.getByTestId('tutorial-recheck').click();
  await step(page, 'history-tab');
  await page.getByTestId('debug-tab-history').click();
  await expect(page.getByTestId('local-history-entry')).toHaveCount(1);
  await expect(page.getByTestId('local-history-entry')).toHaveAttribute('data-status', 'success');
  await step(page, 'quiz-where');
  await page.getByTestId('tutorial-quiz-chat').click();
  await step(page, 'quiz-where');
  await page.getByTestId('tutorial-quiz-ports').click();
  await completed(page, 'debug-why-not-working');
});


test('модель: ошибка внутри не считается успехом внешнего вызова; исправление помогает', async ({ page }) => {
  await createLessonModel(page);
  await page.getByTestId('canvas-node-models.call').dblclick();
  const converter = await add(page, 'data.text_to_number');
  await moveNode(page, converter, 800, 480);
  const text = page.getByTestId('canvas-node-core.text');
  await moveNode(page, text, 370, 200);
  await connectPorts(page, port(text, 'output', 'text'), port(converter, 'input', 'value'));
  await page.getByRole('button', { name: 'Проект', exact: true }).click();
  await page.getByTestId('run-button').click();
  await page.getByTestId('debug-tab-ports').click();
  await expect(page.getByTestId('debug-node-models.call')).toHaveAttribute('data-status', 'error');
  await expect(page.getByTestId('debug-node-models.call').getByTestId('output-result')).toHaveCount(0);
  await step(page, 'run');
  await page.getByTestId('canvas-node-models.call').dblclick();
  await page.getByTestId('canvas-node-data.text_to_number').click();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('canvas-node-data.text_to_number')).toHaveCount(0);
  await page.getByRole('button', { name: 'Проект', exact: true }).click();
  await page.getByTestId('run-button').click();
  await step(page, 'drilldown');
  await expect(page.getByTestId('debug-node-models.call')).toHaveAttribute('data-status', 'success');
  await page.getByTestId('tutorial-ack').click();
  await page.getByTestId('tutorial-quiz-reuse').click();
  await completed(page, 'models-first-model');
});

test('отладка: новый запуск проверяется и после заполнения истории из 30 записей', async ({ page }) => {
  await startLesson(page, 'debug-why-not-working');
  const text = await add(page, 'core.text');
  await page.getByTestId('debug-tab-history').click();
  // Реальные запуски до шага запуска; историю/сторы не подменяем.
  for (let count = 1; count <= 30; count++) {
    await page.getByTestId('run-button').click();
    await expect(page.getByTestId('local-history-entry')).toHaveCount(count);
  }
  const log = await add(page, 'debug.log');
  await arrangePair(page, text, log);
  await connectPorts(page, port(text, 'output', 'text'), port(log, 'input', 'value'));
  await step(page, 'run');
  await page.getByTestId('run-button').click();
  // Ни смены вкладки, ни ручной перепроверки: автошаг должен сработать сам.
  await step(page, 'open-debug');
  await expect(page.getByTestId('local-history-entry')).toHaveCount(30);
  await page.getByTestId('debug-tab-log').click();
  await page.getByTestId('debug-tab-ports').click();
  await page.getByTestId('debug-tab-history').click();
  await page.getByTestId('tutorial-quiz-ports').click();
  await completed(page, 'debug-why-not-working');
});
