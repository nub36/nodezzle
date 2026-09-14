import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Псевдоним '@' указывает на корень исходников (см. tsconfig paths).
const srcDir = new URL('./src', import.meta.url).pathname;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': srcDir,
    },
  },
  server: {
    host: true,
    port: 5173,
    // Платформа проксирует превью через внешний host — разрешаем все хосты.
    allowedHosts: true,
    // АПИ-сервер NODEZZLE (npm run server:dev) — относительные запросы
    // браузера уходят сюда; токен/куки не покидают связку браузер-сервер.
    proxy: {
      '/api': { target: 'http://127.0.0.1:4210', changeOrigin: false },
    },
  },
});
