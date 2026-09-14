/** Мини-роутер: совпадение путей, параметры, методы. */

import { describe, expect, it } from 'vitest';
import { Router } from './router.ts';

describe('Роутер', () => {
  it('находит точные маршруты', () => {
    const router = new Router().get('/api/health', () => {});
    const m = router.match('GET', '/api/health');
    expect(m).not.toBeNull();
    expect(m).not.toBe('method_not_allowed');
  });

  it('извлекает параметры пути и раскодирует их', () => {
    const router = new Router().get('/api/projects/:id/runs/:runId', () => {});
    const m = router.match('GET', '/api/projects/abc%20def/runs/42');
    expect(m).not.toBeNull();
    expect(m).not.toBe('method_not_allowed');
    if (m !== null && m !== 'method_not_allowed') {
      expect(m.params).toEqual({ id: 'abc def', runId: '42' });
    }
  });

  it('различает «путь не найден» и «метод не разрешён»', () => {
    const router = new Router().get('/api/health', () => {});
    expect(router.match('POST', '/api/health')).toBe('method_not_allowed');
    expect(router.match('GET', '/api/unknown')).toBeNull();
    expect(router.match('GET', '/api/health/extra')).toBeNull();
  });

  it('игнорирует завершающие слеши при сопоставлении (путь нормализует приложение)', () => {
    const router = new Router().get('/api/health', () => {});
    expect(router.match('GET', '/api/health')).not.toBeNull();
  });
});
