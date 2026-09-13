/**
 * NODEZZLE — регистрация всех блоков приложения.
 *
 * Ядро не знает о конкретных блоках: приложение объявляет их здесь,
 * а Canvas, runtime и Debug UI читают BlockRegistry.
 * Добавление платформы = новый файл-модуль с Block Definitions.
 */

import { blockRegistry } from '@/core/registry/block-registry';
import { coreBlocks } from './core/blocks';
import { dataBlocks } from './data/blocks';
import { logicBlocks } from './logic/blocks';
import { flowBlocks } from './flow/blocks';
import { telegramBlocks } from './telegram/blocks';
import { webBlocks } from './web/blocks';
import { modelBlocks } from './models/blocks';
import { debugBlocks } from './debug/blocks';
import { datetimeBlocks } from './datetime/blocks';
import { reservedBlocks } from './reserved';

const ALL_BLOCKS = [
  ...coreBlocks,
  ...dataBlocks,
  ...logicBlocks,
  ...flowBlocks,
  ...telegramBlocks,
  ...webBlocks,
  ...modelBlocks,
  ...debugBlocks,
  ...datetimeBlocks,
  ...reservedBlocks,
];

// register() бросает на дубликаты id — проверяем реестр,
// чтобы двойная загрузка модуля не ломала приложение.
for (const def of ALL_BLOCKS) {
  if (!blockRegistry.has(def.id)) {
    blockRegistry.register(def);
  }
}

export { blockRegistry };
