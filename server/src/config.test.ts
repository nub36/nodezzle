/** Конфигурация сервера: значения по умолчанию и защита от недопустимых. */

import { describe, expect, it } from 'vitest';
import { ConfigError, FORBIDDEN_PORTS, loadConfig } from './config.ts';

describe('Конфигурация сервера', () => {
  it('даёт безопасные значения по умолчанию для локальной разработки', () => {
    const cfg = loadConfig({});
    expect(cfg.host).toBe('127.0.0.1');
    expect(cfg.port).toBe(4210);
    expect(cfg.env).toBe('development');
    expect(cfg.maxBodyBytes).toBe(256 * 1024);
    expect(cfg.dbPath.endsWith('nodezzle.db')).toBe(true);
    expect(FORBIDDEN_PORTS.has(cfg.port)).toBe(false);
  });

  it('читает переопределения из окружения', () => {
    const cfg = loadConfig({
      NODEZZLE_API_HOST: '0.0.0.0',
      NODEZZLE_API_PORT: '5599',
      NODEZZLE_DB_PATH: '/tmp/custom.db',
      NODEZZLE_ENV: 'production',
      NODEZZLE_MAX_BODY_BYTES: '1024',
    });
    expect(cfg.host).toBe('0.0.0.0');
    expect(cfg.port).toBe(5599);
    expect(cfg.dbPath).toBe('/tmp/custom.db');
    expect(cfg.env).toBe('production');
    expect(cfg.maxBodyBytes).toBe(1024);
  });

  it('отвергает порты 3000 и 3001 (чужой сайт на VPS)', () => {
    for (const port of ['3000', '3001']) {
      expect(() => loadConfig({ NODEZZLE_API_PORT: port })).toThrow(ConfigError);
    }
  });

  it('отвергает битый порт и битый лимит тела', () => {
    expect(() => loadConfig({ NODEZZLE_API_PORT: 'не-число' })).toThrow(ConfigError);
    expect(() => loadConfig({ NODEZZLE_API_PORT: '70000' })).toThrow(ConfigError);
    expect(() => loadConfig({ NODEZZLE_MAX_BODY_BYTES: '-5' })).toThrow(ConfigError);
  });

  it('отвергает неизвестное окружение', () => {
    expect(() => loadConfig({ NODEZZLE_ENV: 'staging' })).toThrow(ConfigError);
  });
});
