/**
 * Обработчик входящих обновлений: вебхук → ТОЛЬКО опубликованная
 * (LIVE) версия → рантайм → транспорт Bot API (подэтап 5.8D).
 *
 * Черновик (`projects.document`) здесь не читается для исполнения —
 * только снапшот версии со статусом `LIVE`. Симулятор фронтенда
 * остаётся отдельным контуром и токенов не требует.
 */

import type { ServerConfig } from '../config.ts';
import type { ProjectStore } from '../projects/store.ts';
import type { VersionStore } from '../projects/versions.ts';
import type { SecretStore } from '../secrets/store.ts';
import type { TelegramBotMeta } from './bots.ts';
import type { TelegramEvent } from './updates.ts';
import { runLiveExecution, ParallelLimitError } from '../execution/run.ts';
import { createTelegramApi, type TelegramTransport } from './api.ts';

export interface TelegramHandlerDeps {
  config: ServerConfig;
  projects: ProjectStore;
  versions: VersionStore;
  secrets: SecretStore;
  /** Фабрика транспорта; в тестах — только мок, без реальной сети. */
  transportFor?: (token: string) => TelegramTransport;
}

export type TelegramUpdateHandler = (bot: TelegramBotMeta, event: TelegramEvent) => Promise<void>;

export function createTelegramUpdateHandler(deps: TelegramHandlerDeps): TelegramUpdateHandler {
  const transportFor = deps.transportFor ?? ((token: string) => createTelegramApi({ token }));

  return async (bot, event) => {
    if (!bot.projectId) return; // бот без привязки — события игнорируются
    const project = deps.projects.get(bot.projectId);
    if (!project) return;
    const live = deps.versions.findLive(project.id);
    if (!live) return; // нет публикации — черновик не исполняется
    const liveDoc = deps.versions.get(project.id, live.id);
    if (!liveDoc) return;

    const token = deps.secrets.decrypt(bot.workspaceId, bot.secretId);
    if (!token) throw new Error('Секрет бота не найден в рабочем пространстве');

    const limits = {
      timeoutMs: deps.config.execTimeoutMs ?? 10_000,
      maxParallel: deps.config.execMaxParallel ?? 2,
    };
    let result;
    try {
      result = await runLiveExecution(liveDoc, event.payload, limits);
    } catch (err) {
      if (err instanceof ParallelLimitError) return; // тихо: нет ресурса — нет запуска
      throw err;
    }

    const transport = transportFor(token);
    for (const msg of result.outbox) {
      // Снапшот-журнал хранит текст; фото-сообщения пока отправляются
      // подписью как текстом (см. docs/TELEGRAM.md).
      await transport.sendMessage({ chatId: msg.chatId, text: msg.text });
    }
  };
}
