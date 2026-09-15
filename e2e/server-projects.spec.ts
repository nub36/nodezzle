import { expect, test, type Page } from '@playwright/test';
import { createDemoProject } from '../src/demo/seed';
const panel = (page: Page) => page.getByRole('region', { name: 'Серверные копии проектов' });
const email = () => `copies-${crypto.randomUUID()}@example.invalid`;
const password = 'E2E-only-not-a-real-password-10A';
async function dashboard(page: Page) {
  await page.goto('/#/dashboard');
  if (await page.getByTestId('onboarding-skip').isVisible()) await page.getByTestId('onboarding-skip').click();
  await expect(panel(page).getByRole('button', { name: 'Проверить аккаунт' })).toBeEnabled();
}
async function auth(page: Page, address: string, register = true) {
  const p = panel(page);
  if (register) {
    await p.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
    await p.getByLabel('Имя', { exact: true }).fill('Проверка копий');
  }
  await p.getByLabel('Электронная почта').fill(address);
  await p.getByLabel('Пароль (от 8 символов)').fill(password);
  await p.getByRole('button', { name: register ? 'Создать аккаунт' : 'Войти', exact: true }).click();
  await expect(p.getByRole('button', { name: 'Выйти', exact: true })).toBeEnabled();
  await expect(p).toContainText(address);
}
async function chooseWorkspace(page: Page) {
  const select = panel(page).getByLabel('Рабочее пространство');
  await expect(select).toHaveValue('');
  await select.selectOption({ index: 1 });
  await expect(panel(page).getByRole('button', { name: 'Обновить список' })).toBeEnabled();
  return select.inputValue();
}
async function rawProjects(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('nodezzle.project.'))));
}
async function fixture(page: Page) {
  await dashboard(page);
  const doc = createDemoProject();
  await page.evaluate((document) => localStorage.setItem(`nodezzle.project.${document.id}`, JSON.stringify(document)), doc);
  await page.reload();
  await expect(panel(page).getByRole('button', { name: 'Проверить аккаунт' })).toBeEnabled();
  await auth(page, email());
  const ws = await chooseWorkspace(page);
  await panel(page).getByLabel('Локальный проект для копирования').selectOption(doc.id);
  return { doc, ws };
}
async function upload(page: Page) {
  await panel(page).getByRole('button', { name: 'Сохранить новую серверную копию' }).click();
  await expect(panel(page).getByRole('status')).toContainText('Новая серверная копия сохранена');
  await expect(panel(page).getByTestId('server-project')).toHaveCount(1);
}

test('реальный API: demo → сервер → F5 → другой браузер → локальная копия → Canvas; без пароля в проекте', async ({ page, browser }) => {
  await dashboard(page);
  await page.getByRole('button', { name: /Загрузить пример/ }).click();
  await expect(page.getByTestId('canvas-node-models.call')).toHaveCount(1);
  await dashboard(page);
  const before = await rawProjects(page);
  const source = JSON.parse(Object.values(before)[0]);
  const address = email();
  await auth(page, address);
  const ws = await chooseWorkspace(page);
  await panel(page).getByLabel('Локальный проект для копирования').selectOption(source.id);
  await upload(page);
  expect(await rawProjects(page)).toEqual(before);
  const rows = await (await page.request.get(`/api/workspaces/${ws}/projects`)).json();
  const serverId = rows.projects[0].id;
  expect(serverId).not.toBe(source.id);
  const remote = (await (await page.request.get(`/api/projects/${serverId}`)).json()).project;
  expect(remote.canvas).toEqual(source.canvas); expect(remote.models).toEqual(source.models);
  await page.reload(); await chooseWorkspace(page);
  await expect(panel(page).getByTestId('server-project')).toHaveCount(1);
  const context = await browser.newContext();
  const other = await context.newPage();
  try {
    await dashboard(other); await auth(other, address, false); await chooseWorkspace(other);
    expect(await rawProjects(other)).toEqual({});
    await panel(other).getByRole('button', { name: 'Создать локальную копию', exact: true }).click();
    const link = panel(other).getByRole('link', { name: 'Открыть локальную копию' });
    await expect(link).toBeVisible();
    const copy = JSON.parse(Object.values(await rawProjects(other))[0]);
    expect(copy.id).not.toBe(source.id); expect(copy.id).not.toBe(serverId);
    expect(copy.canvas).toEqual(source.canvas); expect(copy.models).toEqual(source.models);
    expect(JSON.stringify(await rawProjects(other))).not.toContain(password);
    expect(await other.evaluate(() => document.cookie)).not.toContain('nodezzle_session');
    await link.click(); await expect(other.getByTestId('canvas-node-models.call')).toHaveCount(1);
    await other.reload(); await expect(other.getByTestId('canvas-node-models.call')).toHaveCount(1);
    expect(await rawProjects(page)).toEqual(before);
  } finally { await context.close(); }
});

test('выход и другой аккаунт не показывают серверные копии прежнего; локальные остаются, песочницы исключены', async ({ page }) => {
  const { doc, ws } = await fixture(page); await upload(page);
  const rows = await (await page.request.get(`/api/workspaces/${ws}/projects`)).json();
  const before = await rawProjects(page);
  await panel(page).getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(panel(page).getByTestId('server-project')).toHaveCount(0);
  await auth(page, email()); await chooseWorkspace(page);
  await expect(panel(page)).toContainText('пока нет серверных проектов');
  expect((await page.request.get(`/api/projects/${rows.projects[0].id}`)).status()).toBe(404);
  expect((await page.request.get(`/api/workspaces/${ws}/projects`)).status()).toBe(404);
  expect(await rawProjects(page)).toEqual(before);
  const sandbox = { ...doc, id: 'lesson-copy-test', name: 'Учебная песочница', meta: { ...doc.meta, tutorial: { lessonId: 'ports' } } };
  await page.evaluate((value) => localStorage.setItem(`nodezzle.project.${value.id}`, JSON.stringify(value)), sandbox);
  await page.reload(); await chooseWorkspace(page);
  await expect(panel(page).getByLabel('Локальный проект для копирования').locator('option')).toHaveCount(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('nodezzle.project.lesson-copy-test')!).meta.tutorial)).toEqual({ lessonId: 'ports' });
});

test('ошибка POST и недостоверный ответ не успех; повтор блокируется до обновления, локальный оригинал прежний', async ({ page }) => {
  await fixture(page); const before = await rawProjects(page);
  let requests = 0;
  await page.route('**/api/projects', async (route) => { requests++; await route.fulfill({ status: 413, json: { error: { code: 'LARGE', message: 'private-internal-message' } } }); });
  const save = panel(page).getByRole('button', { name: 'Сохранить новую серверную копию' });
  await save.click();
  await expect(panel(page)).toContainText('Сохранение не подтверждено');
  await expect(panel(page)).not.toContainText('private-internal-message');
  await expect(save).toBeDisabled(); expect(requests).toBe(1);
  expect(await rawProjects(page)).toEqual(before);
  await page.unroute('**/api/projects');
  await panel(page).getByRole('button', { name: 'Обновить список' }).click();
  await expect(save).toBeEnabled();
  await page.route('**/api/projects', (route) => route.fulfill({ status: 200, body: '<html>not an API</html>' }));
  await save.click();
  await expect(panel(page)).toContainText('Сервер вернул неподдерживаемый ответ');
  await expect(panel(page).getByTestId('server-project')).toHaveCount(0);
  expect(await rawProjects(page)).toEqual(before);
});

test('ошибка локальной квоты при восстановлении не успех и не перезапись; узкий экран', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page); await upload(page); const before = await rawProjects(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.startsWith('nodezzle.project.')) throw new DOMException('full', 'QuotaExceededError');
      original.call(this, k, v);
    };
  });
  await panel(page).getByRole('button', { name: 'Создать локальную копию', exact: true }).click();
  await expect(panel(page)).toContainText('Не удалось сохранить локальную копию');
  await expect(panel(page).getByRole('link', { name: 'Открыть локальную копию' })).toHaveCount(0);
  expect(await rawProjects(page)).toEqual(before);
  expect(await panel(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('позднее восстановление после ухода с Dashboard не записывает локальную копию', async ({ page }) => {
  await fixture(page); await upload(page); const before = await rawProjects(page);
  let release!: () => void; const hold = new Promise<void>((resolve) => { release = resolve; });
  let started!: () => void; const requested = new Promise<void>((resolve) => { started = resolve; });
  let done!: () => void; const finished = new Promise<void>((resolve) => { done = resolve; });
  await page.route('**/api/projects/*', async (route) => {
    const response = await route.fetch(); started(); await hold;
    await route.fulfill({ response }); done();
  });
  await panel(page).getByRole('button', { name: 'Создать локальную копию', exact: true }).click();
  await requested;
  // Hash-навигация размонтирует панель, не уничтожая ожидающий fetch.
  await page.evaluate(() => { location.hash = '/'; });
  await expect(panel(page)).toHaveCount(0); release(); await finished;
  await dashboard(page);
  expect(await rawProjects(page)).toEqual(before);
});

test('выход в другой вкладке отменяет ожидающее восстановление и очищает серверный список', async ({ page, context }) => {
  await fixture(page); await upload(page); const before = await rawProjects(page);
  const other = await context.newPage(); await dashboard(other);
  let release!: () => void; const hold = new Promise<void>((resolve) => { release = resolve; });
  let started!: () => void; const requested = new Promise<void>((resolve) => { started = resolve; });
  let done!: () => void; const finished = new Promise<void>((resolve) => { done = resolve; });
  await page.route('**/api/projects/*', async (route) => {
    const response = await route.fetch(); started(); await hold;
    await route.fulfill({ response }); done();
  });
  await panel(page).getByRole('button', { name: 'Создать локальную копию', exact: true }).click();
  await requested;
  await panel(other).getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Войти', exact: true })).toBeEnabled();
  await expect(panel(page).getByTestId('server-project')).toHaveCount(0);
  release(); await finished;
  await panel(page).getByRole('button', { name: 'Проверить аккаунт' }).click();
  await expect(panel(page).getByRole('button', { name: 'Проверить аккаунт' })).toBeEnabled();
  expect(await rawProjects(page)).toEqual(before);
  await other.close();
});

test('недоступный API не блокирует локальный Dashboard; протухшая сессия не восстанавливает копию', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.abort());
  await dashboard(page);
  await expect(panel(page)).toContainText('Проверьте соединение');
  await expect(page.getByTestId('create-project')).toBeEnabled();
  await page.unroute('**/api/auth/me');
  await fixture(page); await upload(page); const before = await rawProjects(page);
  await page.request.post('/api/auth/logout');
  await panel(page).getByRole('button', { name: 'Создать локальную копию', exact: true }).click();
  await expect(panel(page)).toContainText('Сессия недействительна');
  await expect(panel(page).getByRole('button', { name: 'Войти', exact: true })).toBeEnabled();
  await expect(panel(page).getByTestId('server-project')).toHaveCount(0);
  expect(await rawProjects(page)).toEqual(before);
});
