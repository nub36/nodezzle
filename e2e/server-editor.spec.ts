import { test, expect, type Page, type Cookie } from '@playwright/test';
import { createDemoProject } from '../src/demo/seed';
const status = (page: Page) => page.getByTestId('server-save-status');
const bar = (page: Page) => page.getByRole('region', { name: 'Серверный редактор', exact: true });
const title = (page: Page) => page.getByTitle('Название', { exact: true });
const doc = () => ({ ...createDemoProject(), id: crypto.randomUUID(), name: 'Серверный тест' });
let account: { cookies: Cookie[]; email: string } | null = null;
async function setup(page: Page) {
  await page.goto('/#/dashboard');
  await page.getByTestId('onboarding-skip').click();
  if (account) await page.context().addCookies(account.cookies);
  else {
    const email = `editor-${crypto.randomUUID()}@example.invalid`;
    const registered = await page.request.post('/api/auth/register', { data: { email, password: 'Only-test-password-10B2', name: 'Редактор' } });
    expect(registered.status()).toBe(201); account = { cookies: await page.context().cookies(), email };
  }
  const workspaceId = (await (await page.request.get('/api/workspaces')).json()).workspaces[0].id;
  const document = doc();
  const created = await page.request.post('/api/projects', { data: { workspaceId, document } }); expect(created.status()).toBe(201);
  // Такой же ID в локальном хранилище не должен быть затронут серверным редактором.
  const local = { ...document, name: 'Локальный оригинал' };
  await page.evaluate((value) => localStorage.setItem(`nodezzle.project.${value.id}`, JSON.stringify(value)), local);
  await open(page, document.id);
  return { document, local, workspaceId };
}
async function open(page: Page, id: string) {
  await page.goto(`/#/server-projects/${id}`);
  await expect(status(page)).toHaveText('Сохранено на сервере');
}
async function read(page: Page, id: string) { return (await (await page.request.get(`/api/projects/${id}`)).json()).project; }
async function save(page: Page, name: string) {
  await title(page).fill(name);
  await expect(bar(page).getByRole('button', { name: 'Сохранить сейчас', exact: true })).toBeEnabled();
  await bar(page).getByRole('button', { name: 'Сохранить сейчас', exact: true }).click();
  await expect(status(page)).toHaveText('Сохранено на сервере');
}
async function inspect(page: Page) { await bar(page).getByRole('button', { name: 'Проверить сервер', exact: true }).click(); }
async function accept(page: Page, label: string) {
  page.once('dialog', (dialog) => dialog.accept());
  await bar(page).getByRole('button', { name: label, exact: true }).click();
}

test('серверный Canvas: автосохранение/F5, правки модели; local/server с одинаковым ID независимы', async ({ page }) => {
  const { document, local } = await setup(page);
  await save(page, 'Сохранён на сервере');
  expect((await read(page, document.id)).name).toBe('Сохранён на сервере');
  await page.reload(); await expect(title(page)).toHaveValue('Сохранён на сервере');
  await page.getByTestId('canvas-node-models.call').dblclick();
  await expect(page.getByTestId('canvas-node-core.input')).toBeVisible();
  // Переход внутрь модели сохраняет целый проект, не подменяет корневую схему.
  await title(page).fill('Правка внутри модели');
  await expect(status(page)).toHaveText('Сохранено на сервере', { timeout: 10000 });
  const remote = await read(page, document.id);
  expect(remote.models).toHaveLength(1); expect(remote.canvas.nodes).toHaveLength(document.canvas.nodes.length);
  expect(await page.evaluate((id) => JSON.parse(localStorage.getItem(`nodezzle.project.${id}`)!), document.id)).toEqual(local);
  await page.goto(`/#/projects/${document.id}`); await expect(title(page)).toHaveValue(local.name);
  await title(page).fill('Локальная правка'); await expect(page.getByText(/Сохранено /).first()).toBeVisible();
  expect((await read(page, document.id)).name).toBe('Правка внутри модели');
});

test('правки во время PUT отправляются следующим запросом с новой ревизией, поздний ACK не стирает их', async ({ page }) => {
  const { document } = await setup(page);
  let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
  let started!: () => void; const entered = new Promise<void>((r) => { started = r; });
  const writes: string[] = [];
  await page.route(`**/api/projects/${document.id}`, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    writes.push(route.request().postDataJSON().document.name);
    const response = await route.fetch();
    if (writes.length === 1) { started(); await gate; }
    await route.fulfill({ response });
  });
  await title(page).fill('Первая'); await bar(page).getByRole('button', { name: 'Сохранить сейчас' }).click(); await entered;
  await title(page).fill('Вторая'); await expect(status(page)).toHaveText('Сохраняем на сервер…');
  release(); await expect(status(page)).toHaveText('Сохранено на сервере', { timeout: 10000 });
  expect(writes).toEqual(['Первая', 'Вторая']); expect((await read(page, document.id)).name).toBe('Вторая'); await expect(title(page)).toHaveValue('Вторая');
});

test('две вкладки: конфликт не теряет правки, локальная копия и явное принятие сервера', async ({ page, context }) => {
  const { document } = await setup(page);
  const other = await context.newPage(); await open(other, document.id);
  await save(page, 'Победитель');
  await title(other).fill('Мои правки'); await bar(other).getByRole('button', { name: 'Сохранить сейчас' }).click();
  await expect(status(other)).toHaveText('Автосохранение приостановлено'); await expect(title(other)).toHaveValue('Мои правки');
  expect((await read(other, document.id)).name).toBe('Победитель');
  await bar(other).getByRole('button', { name: 'Сохранить локальную копию' }).click(); await expect(bar(other)).toContainText('Локальная копия сохранена');
  await inspect(other); await expect(bar(other)).toContainText('Победитель');
  await accept(other, 'Принять серверную версию'); await expect(title(other)).toHaveValue('Победитель');
  await other.close();
});

test('ошибка сети → F5 → выбор резервного черновика → проверка и явная отправка', async ({ page }) => {
  const { document } = await setup(page);
  let writes = 0;
  await page.route(`**/api/projects/${document.id}`, (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    writes++; return route.abort();
  });
  await title(page).fill('Моё офлайн'); await bar(page).getByRole('button', { name: 'Сохранить сейчас' }).click();
  await expect(status(page)).toHaveText('Автосохранение приостановлено'); expect(writes).toBe(1);
  page.once('dialog', (dialog) => dialog.accept()); await page.reload();
  await expect(page.getByText('Найдены несохранённые черновики', { exact: true })).toBeVisible();
  await page.getByTestId('recover-server-draft').first().click(); await expect(title(page)).toHaveValue('Моё офлайн');
  await expect(status(page)).toHaveText('Автосохранение приостановлено'); expect(writes).toBe(1);
  await page.unroute(`**/api/projects/${document.id}`); await inspect(page);
  await accept(page, 'Отправить мои правки вместо этой версии'); await expect(status(page)).toHaveText('Сохранено на сервере');
  expect((await read(page, document.id)).name).toBe('Моё офлайн');
});

test('сервер принял PUT, но ответ потерян: проверка признаёт успех без повторной записи', async ({ page }) => {
  const { document } = await setup(page); let writes = 0;
  await page.route(`**/api/projects/${document.id}`, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    writes++; await route.fetch(); await route.abort();
  });
  await title(page).fill('Принято без ответа'); await bar(page).getByRole('button', { name: 'Сохранить сейчас' }).click();
  await expect(status(page)).toHaveText('Автосохранение приостановлено'); await inspect(page);
  await expect(status(page)).toHaveText('Сохранено на сервере'); expect(writes).toBe(1);
});

test('отзыв сессии, чужой аккаунт и резерв: нет отправки от другого пользователя', async ({ page }) => {
  const { document } = await setup(page);
  await page.request.post('/api/auth/logout'); account = null;
  await title(page).fill('После выхода'); await bar(page).getByRole('button', { name: 'Сохранить сейчас' }).click();
  await expect(bar(page)).toContainText('Аккаунт изменился');
  const registered = await page.request.post('/api/auth/register', { data: { email: `other-${crypto.randomUUID()}@example.invalid`, password: 'Only-test-password-10B2', name: 'Другой' } }); expect(registered.status()).toBe(201);
  await inspect(page); await expect(bar(page)).toContainText('Аккаунт изменился');
  page.once('dialog', (dialog) => dialog.accept()); await page.reload();
  await expect(page.getByRole('alert')).toContainText('больше недоступны');
  await expect(page.getByTestId('recover-server-draft')).toHaveCount(0);
  expect((await page.request.get(`/api/projects/${document.id}`)).status()).toBe(404);
});

test('квота резервного хранилища видна на 390 px; серверное сохранение продолжает работать', async ({ page }) => {
  const { document } = await setup(page); await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) {
    if (key.startsWith('nodezzle.server-draft.')) throw new DOMException('full', 'QuotaExceededError'); set.call(this, key, value);
  }; });
  await title(page).fill('Квота'); await expect(bar(page)).toContainText('Резервный черновик недоступен');
  await bar(page).getByRole('button', { name: 'Сохранить сейчас' }).click(); await expect(status(page)).toHaveText('Сохранено на сервере');
  expect((await read(page, document.id)).name).toBe('Квота'); expect(await bar(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('проект удалён: резерв переживает F5 и экспортируется локально без восстановления на сервер', async ({ page }) => {
  const { document } = await setup(page);
  const current = await (await page.request.get(`/api/projects/${document.id}`)).json();
  expect((await page.request.delete(`/api/projects/${document.id}`, { data: { expectedRevision: current.revision } })).status()).toBe(200);
  await title(page).fill('После удаления'); await bar(page).getByRole('button', { name: 'Сохранить сейчас' }).click();
  await expect(bar(page)).toContainText('Проект удалён');
  page.once('dialog', (dialog) => dialog.accept()); await page.reload();
  await expect(page.getByText(/Проект недоступен, но в браузере есть резерв/)).toBeVisible();
  await page.getByRole('button', { name: /Сохранить локальную копию · После удаления/ }).click();
  await page.getByRole('link', { name: 'Открыть локальную копию' }).click();
  await expect(title(page)).toHaveValue('После удаления'); await expect(status(page)).toHaveCount(0);
  expect((await page.request.get(`/api/projects/${document.id}`)).status()).toBe(404);
});

test('новые правки после просмотра конфликта защищены CAS при явной замене', async ({ page }) => {
  const { document } = await setup(page);
  await title(page).fill('Мои'); await inspect(page);
  await expect(bar(page)).toContainText('Серверная база не изменилась');
  const remote = await (await page.request.get(`/api/projects/${document.id}`)).json();
  expect((await page.request.put(`/api/projects/${document.id}`, { data: { document: { ...remote.project, name: 'Ещё новее' }, expectedRevision: remote.revision } })).status()).toBe(200);
  await accept(page, 'Отправить мои правки вместо этой версии');
  await expect(status(page)).toHaveText('Автосохранение приостановлено'); await expect(title(page)).toHaveValue('Мои');
  expect((await read(page, document.id)).name).toBe('Ещё новее');
});

test('между устройствами: вход в другой браузер и загрузка серверной правки без локального оригинала', async ({ page, browser }) => {
  const { document } = await setup(page); await save(page, 'Для другого устройства');
  const context = await browser.newContext(); const other = await context.newPage();
  try {
    await other.goto('/#/dashboard'); await other.getByTestId('onboarding-skip').click();
    expect((await other.request.post('/api/auth/login', { data: { email: account!.email, password: 'Only-test-password-10B2' } })).status()).toBe(200);
    await open(other, document.id); await expect(title(other)).toHaveValue('Для другого устройства');
    expect(await other.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('nodezzle.project.')))).toEqual([]);
    await save(other, 'Правка второго устройства');
    await inspect(page); await expect(bar(page)).toContainText('Правка второго устройства');
    await accept(page, 'Принять серверную версию'); await expect(title(page)).toHaveValue('Правка второго устройства');
  } finally { await context.close(); }
});

test('уход с редактора во время PUT: поздний ответ не открывает старый документ и не удаляет резерв новых правок', async ({ page }) => {
  const { document } = await setup(page);
  let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
  let started!: () => void; const entered = new Promise<void>((r) => { started = r; });
  let finished!: () => void; const completed = new Promise<void>((r) => { finished = r; });
  await page.route(`**/api/projects/${document.id}`, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    const response = await route.fetch(); started(); await gate; await route.fulfill({ response }); finished();
  });
  await title(page).fill('Ушла'); await bar(page).getByRole('button', { name: 'Сохранить сейчас' }).click(); await entered;
  await title(page).fill('Осталась в резерве');
  // Навигация внутри SPA, чтобы ответ действительно пришёл в старый JS-контекст.
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTitle('Назад', { exact: true }).click(); await expect(status(page)).toHaveCount(0);
  release(); await completed;
  await page.goto(`/#/server-projects/${document.id}`);
  await page.getByTestId('recover-server-draft').first().click(); await expect(title(page)).toHaveValue('Осталась в резерве');
  expect((await read(page, document.id)).name).toBe('Ушла');
});

test('переход по ссылке и Назад браузера блокируются при несохранённых правках, отмена сохраняет Canvas', async ({ page }) => {
  await setup(page);
  await page.route('**/api/projects/*', (route) => route.request().method() === 'PUT' ? route.abort() : route.continue());
  await title(page).fill('Не терять'); await bar(page).getByRole('button', { name: 'Сохранить сейчас' }).click();
  await expect(status(page)).toHaveText('Автосохранение приостановлено');
  const first = page.waitForEvent('dialog');
  const click = page.getByTitle('Назад', { exact: true }).click();
  await (await first).dismiss(); await click;
  await expect(title(page)).toHaveValue('Не терять');
  const second = page.waitForEvent('dialog');
  const back = page.goBack();
  await (await second).dismiss(); await back;
  await expect(title(page)).toHaveValue('Не терять');
  const third = page.waitForEvent('dialog');
  const leave = page.getByTitle('Назад', { exact: true }).click();
  await (await third).accept(); await leave;
  await expect(status(page)).toHaveCount(0);
});
