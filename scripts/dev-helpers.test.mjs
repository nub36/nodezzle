/** Помощники лаунчера разработки: разбор вывода, адреса, ошибки. */

import { describe, expect, it } from 'vitest';
import {
  apiBaseUrl,
  classifyServerError,
  healthUrl,
  openBrowserCommand,
  parseViteLocalUrl,
} from './dev-helpers.mjs';

describe('parseViteLocalUrl', () => {
  it('достаёт локальный адрес из разных форм вывода Vite', () => {
    expect(parseViteLocalUrl('  ➜  Local:   http://localhost:5173/ ')).toBe('http://localhost:5173/');
    expect(parseViteLocalUrl('Local: http://localhost:5174/')).toBe('http://localhost:5174/');
  });

  it('не выдаёт адрес из посторонних строк', () => {
    expect(parseViteLocalUrl('Network: use --host to expose')).toBeNull();
    expect(parseViteLocalUrl('')).toBeNull();
    expect(parseViteLocalUrl('Local: ')).toBeNull();
  });
});

describe('apiBaseUrl / healthUrl', () => {
  it('без окружения — безопасный локальный адрес по умолчанию', () => {
    expect(apiBaseUrl({})).toBe('http://127.0.0.1:4210');
    expect(healthUrl({})).toBe('http://127.0.0.1:4210/api/health');
  });

  it('уважает переменные окружения и отбрасывает мусор', () => {
    expect(apiBaseUrl({ NODEZZLE_API_HOST: 'localhost', NODEZZLE_API_PORT: '4999' })).toBe('http://localhost:4999');
    expect(apiBaseUrl({ NODEZZLE_API_PORT: 'не-число' })).toBe('http://127.0.0.1:4210');
    expect(apiBaseUrl({ NODEZZLE_API_PORT: '70000' })).toBe('http://127.0.0.1:4210');
  });
});

describe('classifyServerError', () => {
  it('порт занят', () => {
    const msg = classifyServerError('Error: listen EADDRINUSE: address already in use 127.0.0.1:4210');
    expect(msg).toContain('занят');
    expect(msg).toContain('NODEZZLE_API_PORT');
  });

  it('нет зависимостей', () => {
    const msg = classifyServerError("Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'x'");
    expect(msg).toContain('npm install');
  });

  it('ошибка конфигурации', () => {
    const msg = classifyServerError('ConfigError: NODEZZLE_API_PORT: ожидается целое число');
    expect(msg).toContain('NODEZZLE_');
  });

  it('неизвестный случай — без версии', () => {
    expect(classifyServerError('какая-то другая ошибка')).toBeNull();
  });
});

describe('openBrowserCommand', () => {
  it('открывает только локальные адреса запуска', () => {
    expect(openBrowserCommand('http://localhost:5173/', 'win32')).toEqual({
      command: 'cmd',
      args: ['/d', '/s', '/c', 'start', '', 'http://localhost:5173/'],
    });
    expect(openBrowserCommand('http://127.0.0.1:4210/', 'linux')).toEqual({
      command: 'xdg-open',
      args: ['http://127.0.0.1:4210/'],
    });
    expect(openBrowserCommand('https://example.ru', 'win32')).toBeNull();
    expect(openBrowserCommand('http://localhost:5173/api/x', 'win32')).toBeNull();
  });
});
