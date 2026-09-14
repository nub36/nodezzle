import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Тесты покрывают чистое ядро (тип-система, реестр, формат проекта, runtime),
// поэтому DOM-среда (jsdom) не требуется.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      // Тесты frontend-ядра (src/), сервера (server/) и лаунчера (scripts/).
      include: ['src/**/*.test.ts', 'server/src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    },
  }),
);
