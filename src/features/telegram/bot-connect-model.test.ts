/** Логика подключения бота: токен уходит на сервер и не возвращается. */

import { describe, expect, it } from 'vitest';
import { connectBot, replaceBotToken, looksLikeBotToken, botTokenRef, validateSecretName } from './bot-connect-model';
import type { BotSummary, SecretSummary, ServerApi } from '@/lib/server-api';

function fakeApi() {
  const secrets: SecretSummary[] = [];
  const bots: BotSummary[] = [];
  const sentSecretValues: string[] = [];
  const api: ServerApi = {
    register: async () => {},
    login: async () => {},
    workspaces: async () => [],
    secrets: async () => secrets,
    createSecret: async (_ws, name, value) => {
      sentSecretValues.push(value);
      const secret: SecretSummary = { id: `s${secrets.length + 1}`, name, createdAt: '', updatedAt: '' };
      secrets.push(secret);
      return secret;
    },
    bots: async () => bots,
    createBot: async (_ws, secretId, projectId) => {
      const bot: BotSummary = {
        id: `b${bots.length + 1}`,
        workspaceId: 'w1',
        projectId,
        secretId,
        botUsername: null,
        botName: null,
        webhookPath: 'f'.repeat(64),
        status: 'connected',
        createdAt: '',
        updatedAt: '',
      };
      bots.push(bot);
      return bot;
    },
    replaceBotSecret: async (_ws, botId, secretId) => {
      const bot = bots.find((b) => b.id === botId);
      if (!bot) throw new Error('нет бота');
      bot.secretId = secretId;
      return bot;
    },
    deleteBot: async (_ws, botId) => {
      const idx = bots.findIndex((b) => b.id === botId);
      if (idx >= 0) bots.splice(idx, 1);
    },
    executions: async () => [],
    execution: async () => {
      throw new Error('не используется в этом тесте');
    },
    executionSteps: async () => [],
    audit: async () => [],
  };
  return { api, secrets, bots, sentSecretValues };
}

describe('looksLikeBotToken', () => {
  it('принимает типичный формат и отклоняет мусор', () => {
    expect(looksLikeBotToken('123456789:AAEhBP0avF9YqQx6K3n1Q7u8Jv0w2X4y5zA')).toBe(true);
    expect(looksLikeBotToken(' 123456789:AAEhBP0avF9YqQx6K3n1Q7u8Jv0w2X4y5zA ')).toBe(true);
    expect(looksLikeBotToken('не токен')).toBe(false);
    expect(looksLikeBotToken('123456789')).toBe(false);
    expect(looksLikeBotToken('123:short')).toBe(false);
  });
});

describe('validateSecretName', () => {
  it('пустое и слишком длинное имя отклоняются', () => {
    expect(validateSecretName('')).toBe('empty');
    expect(validateSecretName('   ')).toBe('empty');
    expect(validateSecretName('x'.repeat(121))).toBe('too_long');
    expect(validateSecretName('TG_BOT_TOKEN')).toBeNull();
  });
});

describe('connectBot', () => {
  it('создаёт секрет и бота; наружу токен не возвращается', async () => {
    const { api, bots, sentSecretValues } = fakeApi();
    const result = await connectBot(api, {
      workspaceId: 'w1',
      secretName: 'TG_BOT_TOKEN',
      token: '123456789:AAEhBP0avF9YqQx6K3n1Q7u8Jv0w2X4y5zA',
      projectId: 'proj-1',
    });
    expect(result.bot.secretId).toBe(result.secret.id);
    expect(result.bot.projectId).toBe('proj-1');
    expect(sentSecretValues).toEqual(['123456789:AAEhBP0avF9YqQx6K3n1Q7u8Jv0w2X4y5zA']);
    // Результат не содержит значения токена — только метаданные.
    expect(JSON.stringify(result)).not.toContain('123456789:AAE');
    expect(bots).toHaveLength(1);
  });

  it('невалидный токен или имя не доходят до сервера', async () => {
    const { api, sentSecretValues, bots } = fakeApi();
    await expect(
      connectBot(api, { workspaceId: 'w1', secretName: 'TG', token: 'мусор', projectId: null }),
    ).rejects.toThrow('TOKEN_FORMAT');
    await expect(
      connectBot(api, { workspaceId: 'w1', secretName: '  ', token: '123456789:AAEhBP0avF9YqQx6K3n1Q7u8Jv0w2X4y5zA', projectId: null }),
    ).rejects.toThrow('SECRET_NAME_EMPTY');
    expect(sentSecretValues).toEqual([]);
    expect(bots).toEqual([]);
  });
});

describe('replaceBotToken', () => {
  it('новый секрет переключает бота', async () => {
    const { api, bots } = fakeApi();
    const first = await connectBot(api, {
      workspaceId: 'w1',
      secretName: 'TG_BOT_TOKEN',
      token: '111111111:AAEhBP0avF9YqQx6K3n1Q7u8Jv0w2X4y5zA',
      projectId: null,
    });
    const updated = await replaceBotToken(api, {
      workspaceId: 'w1',
      botId: first.bot.id,
      secretName: 'TG_BOT_TOKEN_NEW',
      token: '222222222:AAEhBP0avF9YqQx6K3n1Q7u8Jv0w2X4y5zB',
    });
    expect(updated.secretId).not.toBe(first.secret.id);
    expect(bots).toHaveLength(1);
  });
});

describe('botTokenRef', () => {
  it('показывает имя секрета, а не значение', () => {
    const bot: BotSummary = {
      id: 'b1',
      workspaceId: 'w1',
      projectId: null,
      secretId: 's9',
      botUsername: 'nodezzle_bot',
      botName: null,
      webhookPath: 'a'.repeat(64),
      status: 'connected',
      createdAt: '',
      updatedAt: '',
    };
    const secrets: SecretSummary[] = [{ id: 's9', name: 'TG_BOT_TOKEN', createdAt: '', updatedAt: '' }];
    expect(botTokenRef(bot, secrets)).toBe('TG_BOT_TOKEN');
    expect(botTokenRef({ ...bot, secretId: 'нет' }, secrets)).toBeNull();
  });
});
