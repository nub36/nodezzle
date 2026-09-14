/**
 * Шифрование секретов: AES-256-GCM через `node:crypto` (без зависимостей).
 *
 * Ключ шифрования: переменная окружения `NODEZZLE_VAULT_KEY`
 * (64 шестнадцатеричных символа = 32 байта). Если не задана — ключ
 * детерминированно выводится из секрета сессий (`scrypt`), чтобы
 * локальный запуск «из коробки» тоже имел рабочее хранилище; в продакшене
 * ключ обязан задаваться явно.
 */

import crypto from 'node:crypto';
import type { ServerConfig } from '../config.ts';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;

let derivedKeyCache: { source: string; key: Buffer } | null = null;

export function resolveVaultKey(config: ServerConfig): Buffer {
  const explicit = config.vaultKeyHex;
  if (explicit !== undefined) {
    if (!/^[0-9a-fA-F]{64}$/.test(explicit)) {
      throw new Error('NODEZZLE_VAULT_KEY должен быть строкой из 64 шестнадцатеричных символов (32 байта)');
    }
    return Buffer.from(explicit, 'hex');
  }
  const source = `vault:${config.sessionSecret}`;
  if (derivedKeyCache && derivedKeyCache.source === source) return derivedKeyCache.key;
  const key = crypto.scryptSync(config.sessionSecret, 'nodezzle-vault-salt', KEY_LENGTH);
  derivedKeyCache = { source, key };
  return key;
}

export interface SealedValue {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function encryptValue(key: Buffer, plaintext: string): SealedValue {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decryptValue(key: Buffer, sealed: SealedValue): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
