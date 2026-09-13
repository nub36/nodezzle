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
  },
});
