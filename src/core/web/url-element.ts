/** URL-элементы — данные, не сетевой клиент. Runtime ничего не загружает. */
export type WebUrlElement = { kind: 'image'; src: string; caption: string }
  | { kind: 'link'; href: string; text: string };
export const WEB_URL_LIMIT = 2048;
export const WEB_URL_TEXT_LIMIT = 65536;

/** Строгий синтаксический список разрешений. DNS и редиректы не проверяются. */
export function safeWebUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > WEB_URL_LIMIT || /[\u0000-\u001f\u007f\\]/u.test(value)) return null;
  const candidate = value.trim();
  if (!/^https:\/\//i.test(candidate) || /\s/u.test(candidate)) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || candidate.split('/')[2].includes('@')) return null;
    const host = url.hostname.replace(/\.$/, '').toLowerCase();
    const labels = host.split('.');
    if (host.length > 253 || labels.length < 2 || /^[\d.]+$/.test(host)) return null;
    if (!labels.every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))) return null;
    if (['localhost', 'local', 'localdomain', 'internal', 'lan', 'home', 'home.arpa', 'test', 'invalid'].some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return null;
    return url.href.length <= WEB_URL_LIMIT ? url.href : null;
  } catch {
    return null;
  }
}

export function buildUrlElement(kind: 'image' | 'link', inputs: Record<string, unknown>, config: Record<string, unknown>): WebUrlElement | null {
  const field = (key: string) => inputs[key] !== undefined ? inputs[key] : config[key] !== undefined ? config[key] : '';
  const url = safeWebUrl(field(kind === 'image' ? 'src' : 'href'));
  const text = field(kind === 'image' ? 'caption' : 'text');
  if (!url || typeof text !== 'string' || text.length > WEB_URL_TEXT_LIMIT) return null;
  return kind === 'image' ? { kind, src: url, caption: text } : { kind, href: url, text };
}

export function readUrlElement(value: unknown): WebUrlElement | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (obj.kind !== 'image' && obj.kind !== 'link') return null;
  if (typeof obj[obj.kind === 'image' ? 'caption' : 'text'] !== 'string') return null;
  return buildUrlElement(obj.kind, obj, {});
}
