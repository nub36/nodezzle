/** Ограничитель частоты: окно, лимит, истечение. */

import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limit.ts';

describe('Ограничитель частоты', () => {
  it('пропускает до лимита и блокирует после', () => {
    const limiter = createRateLimiter(3, 60_000, () => 0);
    expect(limiter.allow('ip')).toBe(true);
    expect(limiter.allow('ip')).toBe(true);
    expect(limiter.allow('ip')).toBe(true);
    expect(limiter.allow('ip')).toBe(false);
    expect(limiter.count('ip')).toBe(3);
    // Другой ключ не ограничен.
    expect(limiter.allow('другой')).toBe(true);
  });

  it('окно скользит: старые запросы перестают учитываться', () => {
    let now = 0;
    const limiter = createRateLimiter(2, 1000, () => now);
    expect(limiter.allow('ip')).toBe(true);
    expect(limiter.allow('ip')).toBe(true);
    expect(limiter.allow('ip')).toBe(false);
    now = 1500; // оба запроса устарели (окно 1000 мс)
    expect(limiter.allow('ip')).toBe(true);
    expect(limiter.allow('ip')).toBe(true);
    expect(limiter.allow('ip')).toBe(false);
    now = 3000; // устарели и эти
    expect(limiter.allow('ip')).toBe(true);
    expect(limiter.count('ip')).toBe(1);
  });
});
