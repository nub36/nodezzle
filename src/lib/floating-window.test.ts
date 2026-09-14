import { describe, expect, it } from 'vitest';
import { clampWindowPosition } from './floating-window';
const size = { width: 304, height: 350 };
const viewport = { width: 1280, height: 800 };
describe('Положение окна урока', () => {
  it('сохраняет допустимую позицию', () => expect(clampWindowPosition({ x: 320, y: 120 }, size, viewport)).toEqual({ x: 320, y: 120 }));
  it('не теряет окно за верхней и левой границами', () => expect(clampWindowPosition({ x: -900, y: -1 }, size, viewport)).toEqual({ x: 8, y: 8 }));
  it('ограничивает правый и нижний края', () => expect(clampWindowPosition({ x: 2000, y: 1000 }, size, viewport)).toEqual({ x: 968, y: 442 }));
  it('после сужения экрана оставляет заголовок доступным', () => expect(clampWindowPosition({ x: 972, y: 442 }, size, { width: 390, height: 640 })).toEqual({ x: 78, y: 282 }));
  it('слишком большое окно и некорректные координаты не дают отрицательную позицию', () => expect(clampWindowPosition({ x: NaN, y: Infinity }, size, { width: 200, height: 100 })).toEqual({ x: 8, y: 8 }));
});
