/**
 * Браузерный E2E-слой Академии (запуск: `npm run test:e2e`).
 *
 * Требует установленный браузер: `npx playwright install chromium`.
 * В средах без исходящего доступа к CDN браузеров слой не выполняется —
 * это зафиксировано в docs/ACADEMY_QA.md, критическая цепочка до уровня
 * состояния доказана интеграционными тестами (`completion-bridge.test.ts`).
 *
 * Поднимает реальный стек: сервер АПИ (4210) + интерфейс Vite (5173).
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    // В CI можно использовать уже установленный Chromium без скачивания с CDN.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] }
      : {},
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: 'npm run server:dev',
      url: 'http://127.0.0.1:4210/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
