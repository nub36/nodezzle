/** Пароли: scrypt-хеши и проверка. */

import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './passwords.ts';

describe('Пароли', () => {
  it('хеширует и проверяет пароль', async () => {
    const hash = await hashPassword('Секретный пароль 123');
    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(await verifyPassword('Секретный пароль 123', hash)).toBe(true);
    expect(await verifyPassword('другой пароль', hash)).toBe(false);
  });

  it('разные хеши для одного пароля (соль случайная)', async () => {
    const a = await hashPassword('один и тот же пароль');
    const b = await hashPassword('один и тот же пароль');
    expect(a).not.toBe(b);
    expect(await verifyPassword('один и тот же пароль', a)).toBe(true);
    expect(await verifyPassword('один и тот же пароль', b)).toBe(true);
  });

  it('отвергает мусор в поле хеша без исключений', async () => {
    expect(await verifyPassword('пароль', 'не хеш')).toBe(false);
    expect(await verifyPassword('пароль', 'scrypt$1$2$3$zz$zz')).toBe(false);
  });
});
