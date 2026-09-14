/**
 * Пароли: хеширование и проверка.
 *
 * Только `scrypt` из `node:crypto` (без внешних зависимостей).
 * Формат хеша: `scrypt$N$r$p$salt_hex$hash_hex` — самодостаточный,
 * параметры хранятся вместе с хешем (можно безопасно менять в будущем).
 */

import crypto from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Хранить пароли можно только в таком виде. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LEN);
  const hash = await scryptAsync(password, salt);
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('hex'), hash.toString('hex')].join('$');
}

/** Проверка пароля по сохранённому хешу (постоянное время сравнения). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltHex, hashHex] = parts;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(password, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) }, (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
