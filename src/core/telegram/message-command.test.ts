import { expect, it } from 'vitest';
import { messageCommand } from './message-command';
it('простой тест и ingress распознают одинаковые команды, адресацию и аргументы', () => {
  expect(messageCommand('/start')).toBe('start');
  expect(messageCommand('/help@my_bot аргументы')).toBe('help');
  expect(messageCommand('обычное сообщение')).toBeUndefined();
  expect(messageCommand(' /start')).toBeUndefined();
  expect(messageCommand('/' + 'a'.repeat(33))).toBeUndefined();
});
