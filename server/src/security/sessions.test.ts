/** Сессии: подписи токенов и cookies. */

import { describe, expect, it } from 'vitest';
import {
  clearSessionCookie,
  newSessionToken,
  parseCookies,
  sessionCookie,
  signToken,
  tokenDigest,
  verifySignedToken,
} from './sessions.ts';

const secret = 'секрет-тест-секрет-тест-секрет-тест-0123456789';

describe('Подпись токенов', () => {
  it('подписывает и проверяет токен', () => {
    const token = newSessionToken();
    const signed = signToken(token, secret);
    expect(verifySignedToken(signed, secret)).toBe(token);
  });

  it('отвергает подделку и другой секрет', () => {
    const token = newSessionToken();
    const signed = signToken(token, secret);
    const [raw] = signed.split('.');
    expect(verifySignedToken(`${raw}.AAAA`, secret)).toBeNull();
    expect(verifySignedToken(signed, 'другой-секрет-другой-секрет-0123456789')).toBeNull();
    expect(verifySignedToken('без-точки', secret)).toBeNull();
  });

  it('дайджест стабилен и не равен токену', () => {
    const token = newSessionToken();
    expect(tokenDigest(token)).toBe(tokenDigest(token));
    expect(tokenDigest(token)).not.toBe(token);
    expect(tokenDigest(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('Cookies', () => {
  it('сессионная cookie — HttpOnly, с временем жизни', () => {
    const cookie = sessionCookie('abc.sig', { maxAgeSeconds: 3600, secure: false });
    expect(cookie).toContain('nodezzle_session=abc.sig');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Max-Age=3600');
    expect(cookie).not.toContain('Secure');
    const secureCookie = sessionCookie('abc.sig', { maxAgeSeconds: 10, secure: true });
    expect(secureCookie).toContain('Secure');
  });

  it('очистка cookie сбрасывает значение и срок', () => {
    expect(clearSessionCookie()).toContain('Max-Age=0');
  });

  it('разбирает заголовок Cookie', () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('a=1; b=x%20y')).toEqual({ a: '1', b: 'x y' });
  });
});
