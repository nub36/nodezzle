/**
 * Ограничитель частоты запросов (окно по времени, в памяти).
 *
 * Защита «грубой силы» эндпоинтов входа/регистрации. Состояние живёт
 * в процессе сервера; для нескольких процессов появится общий стор —
 * интерфейс это позволяет.
 */

export interface RateLimiter {
  /** `true`, если запрос разрешён; `false` — лимит превышен. */
  allow(key: string): boolean;
  /** Текущее число запросов ключа в окне (для тестов и отладки). */
  count(key: string): number;
}

/**
 * @param limit сколько запросов разрешено в окне;
 * @param windowMs размер окна в миллисекундах;
 * @param now источник времени (передаётся в тестах).
 */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>();

  function prune(key: string, currentTime: number): number[] {
    const list = hits.get(key);
    if (!list) return [];
    const fresh = list.filter((t) => currentTime - t < windowMs);
    if (fresh.length === 0) hits.delete(key);
    else hits.set(key, fresh);
    return fresh;
  }

  return {
    allow(key: string): boolean {
      const currentTime = now();
      const fresh = prune(key, currentTime);
      if (fresh.length >= limit) return false;
      fresh.push(currentTime);
      hits.set(key, fresh);
      return true;
    },
    count(key: string): number {
      return prune(key, now()).length;
    },
  };
}
