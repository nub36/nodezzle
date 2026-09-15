import '@/blocks';
import { expect, it } from 'vitest';
import { safeWebUrl, buildUrlElement, readUrlElement, WEB_URL_LIMIT, WEB_URL_TEXT_LIMIT } from './url-element';
import { readWebElement, WEB_TREE_LIMITS } from './layout-element';
import { executeCanvas } from '@/core/runtime/execute';
import { canvasToFlow } from '@/core/project/serialize';
import { webLayoutRoots } from '@/features/canvas/web-layout-roots';

it.each(['https://example.com/a.png', 'HTTPS://EXAMPLE.COM:443/page?q=1#part', ' https://example.com/путь ', 'https://пример.рф/'])('принимает HTTPS и нормализует адрес %s', (url) => {
  expect(safeWebUrl(url)).toBe(new URL(url.trim()).href);
});
it.each([
  '', null, 42, '/image.png', '//example.com/x', 'http://example.com', 'javascript:alert(1)',
  'data:image/svg+xml,<svg/>', 'blob:https://example.com/id', 'file:///etc/passwd', 'mailto:a@example.com',
  'https://user:password@example.com', 'https://@example.com', 'https://example.com:8443',
  'https://localhost', 'https://a.localhost.', 'https://printer.local', 'https://host.internal',
  'https://machine', 'https://127.0.0.1', 'https://2130706433', 'https://0x7f000001',
  'https://0177.0.0.1', 'https://8.8.8.8', 'https://[::1]', 'https://[::ffff:127.0.0.1]',
  'https://example.com\\@evil.com', 'https://example.com/\npath', '\thttps://example.com',
  'https://example.com/a b', 'https://exa_mple.com', 'https://example..com',
])('отклоняет неоднозначный/неразрешённый адрес %j', (url) => {
  expect(safeWebUrl(url)).toBeNull();
});
it('ограничивает исходную и каноническую длину URL', () => {
  expect(safeWebUrl('https://router.home.arpa')).toBeNull();
  const prefix = 'https://example.com/';
  const max = prefix + 'a'.repeat(WEB_URL_LIMIT - prefix.length);
  expect(safeWebUrl(max)).toBe(max);
  expect(safeWebUrl(max + 'a')).toBeNull();
  expect(safeWebUrl(prefix + 'я'.repeat(500))).toBeNull();
});
it('входы приоритетнее настроек, null/пустой адрес не подменяются, подпись может быть пустой', () => {
  expect(buildUrlElement('image', { src: 'https://example.com/b', caption: '' }, { src: 'https://example.com/a', caption: 'Настройка' })).toEqual({ kind: 'image', src: 'https://example.com/b', caption: '' });
  expect(buildUrlElement('link', { href: undefined, text: undefined }, { href: 'https://example.com', text: 'Ссылка' })).toEqual({ kind: 'link', href: 'https://example.com/', text: 'Ссылка' });
  for (const src of ['', null, false]) expect(buildUrlElement('image', { src }, { src: 'https://example.com/a' })).toBeNull();
  for (const caption of [null, 42, {}]) expect(buildUrlElement('image', { src: 'https://example.com', caption }, {})).toBeNull();
});
it('подписи ограничены, читатель не принимает неполный дескриптор и не копирует атрибуты', () => {
  expect(buildUrlElement('image', {}, { src: 'https://example.com', caption: 'x'.repeat(WEB_URL_TEXT_LIMIT + 1) })).toBeNull();
  expect(readUrlElement({ kind: 'image', src: 'https://example.com', caption: '<script>', onerror: 'alert(1)', srcset: 'evil', style: {} })).toEqual({ kind: 'image', src: 'https://example.com/', caption: '<script>' });
  for (const value of [null, [], { kind: 'image', src: 'https://example.com' }, { kind: 'link', text: 'x', href: 'javascript:alert(1)' }]) expect(readUrlElement(value)).toBeNull();
});
it('вложенные картинки/ссылки проверяются повторно, URL входят в бюджет дерева', () => {
  const valid = { kind: 'grid', columns: 2, children: [{ kind: 'image', src: 'https://example.com/a.png', caption: 'Фото' }, { kind: 'link', href: 'https://example.com/', text: 'Сайт' }] };
  expect(readWebElement(valid)).toEqual(valid);
  expect(readWebElement({ ...valid, children: [...valid.children, { kind: 'image', src: 'data:text/html,evil', caption: '' }] })).toBeNull();
  expect(readWebElement({ kind: 'container', children: [{ kind: 'link', href: 'https://example.com/', text: 'x'.repeat(WEB_TREE_LIMITS.text) }] })).toBeNull();
});
it('runtime передаёт URL по настоящим портам; незаконный URL — ошибка без выхода', async () => {
  const doc = { id: 'c', name: 'Холст', nodes: [
    { id: 'url', blockId: 'core.url', config: { value: 'https://example.com/photo.png' }, position: { x: 0, y: 0 } },
    { id: 'image', blockId: 'web.image', config: { caption: 'Из схемы' }, position: { x: 0, y: 0 } },
    { id: 'link', blockId: 'web.link', config: { href: 'https://example.com', text: 'Сайт' }, position: { x: 0, y: 0 } },
  ], edges: [{ id: 'e', source: 'url', sourcePort: 'value', target: 'image', targetPort: 'src' }] };
  const result = await executeCanvas(doc);
  expect(result.status).toBe('success');
  expect(result.nodeRuns.image.outputs.element).toEqual({ kind: 'image', src: 'https://example.com/photo.png', caption: 'Из схемы' });
  expect(result.nodeRuns.link.outputs.element).toEqual({ kind: 'link', href: 'https://example.com/', text: 'Сайт' });
  doc.nodes[2].config.href = 'javascript:alert(1)';
  const invalid = await executeCanvas(doc);
  expect(invalid.nodeRuns.link.error).toBe('ERR_WEB_URL_ELEMENT');
  expect(invalid.nodeRuns.link.outputs).toEqual({});
});
it('image/link становятся дочерними через массив, без лишнего корня', () => {
  const flow = canvasToFlow({ id: 'c', name: 'Холст', nodes: [
    { id: 'image', blockId: 'web.image', config: {}, position: { x: 0, y: 0 } },
    { id: 'link', blockId: 'web.link', config: {}, position: { x: 0, y: 0 } },
    { id: 'a', blockId: 'data.array_add', config: {}, position: { x: 0, y: 0 } },
    { id: 'g', blockId: 'web.grid', config: {}, position: { x: 0, y: 0 } },
  ], edges: [
    { id: 'i', source: 'image', sourcePort: 'element', target: 'a', targetPort: 'item' },
    { id: 'g', source: 'a', sourcePort: 'array', target: 'g', targetPort: 'children' },
  ] });
  expect(webLayoutRoots(flow.nodes, flow.edges).roots.map((n) => n.id)).toEqual(['link', 'g']);
});
