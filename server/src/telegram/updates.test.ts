/** Валидация и нормализация обновлений Telegram. */

import { describe, expect, it } from 'vitest';
import { telegramUpdateSchema, updateToEvent } from './updates.ts';

const validUpdate = {
  update_id: 42,
  message: {
    message_id: 7,
    text: '/start аргументы',
    from: { id: 100, username: 'vasya', first_name: 'Вася' },
    chat: { id: -1001, type: 'group' },
  },
};

describe('telegramUpdateSchema', () => {
  it('принимает корректное обновление', () => {
    expect(telegramUpdateSchema.safeParse(validUpdate).success).toBe(true);
  });

  it('отклоняет недоверенные данные', () => {
    expect(telegramUpdateSchema.safeParse({ update_id: 'сорок два' }).success).toBe(false);
    expect(telegramUpdateSchema.safeParse({ ...validUpdate, update_id: null }).success).toBe(false);
    expect(
      telegramUpdateSchema.safeParse({
        update_id: 1,
        message: { message_id: 1, chat: { type: 'private' } }, // нет id чата
      }).success,
    ).toBe(false);
    expect(telegramUpdateSchema.safeParse('строка вместо объекта').success).toBe(false);
    expect(
      telegramUpdateSchema.safeParse({
        ...validUpdate,
        message: { ...validUpdate.message, text: 'x'.repeat(4097) },
      }).success,
    ).toBe(false);
  });
});

describe('updateToEvent', () => {
  it('нормализует сообщение в событие с командой', () => {
    const parsed = telegramUpdateSchema.parse(validUpdate);
    const event = updateToEvent(parsed);
    expect(event).not.toBeNull();
    expect(event!.updateId).toBe(42);
    expect(event!.payload.source).toBe('telegram');
    expect(event!.payload.telegram).toMatchObject({
      text: '/start аргументы',
      command: 'start',
      user_id: 100,
      username: 'vasya',
      chat_id: -1001,
    });
    // В событие попадает только нормализованный набор полей.
    expect(Object.keys(event!.payload.telegram ?? {})).toEqual(['text', 'command', 'user_id', 'username', 'chat_id']);
  });

  it('обычный текст — без команды; пустой текст допустим', () => {
    const plain = telegramUpdateSchema.parse({
      update_id: 1,
      message: { message_id: 1, text: 'просто текст', chat: { id: 5, type: 'private' } },
    });
    expect(updateToEvent(plain)!.payload.telegram?.command).toBeUndefined();
    expect(updateToEvent(plain)!.payload.telegram?.user_id).toBe(0);

    const noText = telegramUpdateSchema.parse({
      update_id: 2,
      message: { message_id: 2, chat: { id: 5, type: 'private' } },
    });
    expect(updateToEvent(noText)!.payload.telegram?.text).toBe('');
  });

  it('обновление без сообщения игнорируется', () => {
    expect(updateToEvent(telegramUpdateSchema.parse({ update_id: 3 }))).toBeNull();
  });

  it('команда с упоминанием бота распознаётся', () => {
    const upd = telegramUpdateSchema.parse({
      update_id: 4,
      message: { message_id: 4, text: '/help@MyBot детали', chat: { id: 9, type: 'group' } },
    });
    expect(updateToEvent(upd)!.payload.telegram?.command).toBe('help');
  });
});
