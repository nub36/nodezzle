/**
 * Загрузчик-хук Node для исполнения фронтенд-кода на сервере:
 * 1) разрешает алиас `@/` так же, как сборка (см. `@/* → ./src/*`);
 * 2) разрешает безрасширительные относительные импорты (стиль фронтенда),
 *    пробуя `<путь>.ts` и `<путь>/index.ts`.
 *
 * Так сервер исполняет общий с клиентом код (формат проекта, реестр
 * блоков) без копирования. Подключается:
 * `node --import ./server/src/register-alias.mjs`.
 * Файл намеренно .mjs — хуки загрузчика не проходят strip-types.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const srcRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'src');

export async function resolve(specifier, context, next) {
  const isAlias = specifier.startsWith('@/');
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  if ((isAlias || isRelative) && !/\.[a-zA-Z]+$/.test(specifier)) {
    const base = isAlias
      ? path.join(srcRoot, specifier.slice(2))
      : path.join(path.dirname(fileURLToPath(context.parentURL)), specifier);
    for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return next(pathToFileURL(candidate).href, context);
      }
    }
  }
  return next(specifier, context);
}
