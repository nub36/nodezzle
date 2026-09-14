/** AES-256-GCM: шифрование/расшифровка, неверный ключ, проверка ключа. */

import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptValue, encryptValue, resolveVaultKey } from './vault.ts';
import type { ServerConfig } from '../config.ts';

const baseConfig: ServerConfig = {
  host: '127.0.0.1',
  port: 4210,
  dbPath: ':memory:',
  env: 'development',
  repoRoot: '.',
  maxBodyBytes: 1024,
  sessionSecret: 'test-secret-test-secret-test-secret-0123456789',
  sessionTtlDays: 1,
};

describe('vault', () => {
  it('шифрует и расшифровывает значение без потерь', () => {
    const key = resolveVaultKey(baseConfig);
    const plaintext = 'Токен бота: 123456:ABC-DEF_value';
    const sealed = encryptValue(key, plaintext);
    expect(sealed.ciphertext).not.toContain(plaintext);
    expect(decryptValue(key, sealed)).toBe(plaintext);
  });

  it('каждое шифрование даёт новый шифротекст (случайный IV)', () => {
    const key = resolveVaultKey(baseConfig);
    const a = encryptValue(key, 'одно и то же');
    const b = encryptValue(key, 'одно и то же');
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('неверный ключ не расшифровывает (сбой аутентификации)', () => {
    const key = resolveVaultKey(baseConfig);
    const sealed = encryptValue(key, 'секрет');
    const wrong = crypto.randomBytes(32);
    expect(() => decryptValue(wrong, sealed)).toThrow();
  });

  it('явный ключ из 64 hex-символов принимается, мусор — нет', () => {
    const ok = resolveVaultKey({ ...baseConfig, vaultKeyHex: 'ab'.repeat(32) });
    expect(ok.length).toBe(32);
    expect(() => resolveVaultKey({ ...baseConfig, vaultKeyHex: 'короткий' })).toThrow(/NODEZZLE_VAULT_KEY/);
  });

  it('ключ по умолчанию детерминированно выводится из секрета сессий', () => {
    expect(resolveVaultKey(baseConfig)).toEqual(resolveVaultKey({ ...baseConfig }));
  });
});
