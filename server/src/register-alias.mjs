/** Регистрирует хук алиаса `@/` для запуска сервера обычным `node`. */

import { register } from 'node:module';

register('./alias-loader.mjs', import.meta.url);
