/**
 * Категория «Безопасность» (Этап 4, часть F).
 *
 * Шесть деталей исполняются уже сейчас (чистые преобразования без
 * криптографических обещаний), четыре — запланированы до появления
 * серверного хранилища секретов (см. docs/SECURITY.md §3.2).
 */

import type { BlockDefinition } from '@/core/types/blocks';
import { dport, eport } from '../shared';

const securityColor = '#f87171';

/** Простая детерминированная хеш-сумма (FNV-1a), не криптографическая. */
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomString(length: number, alphabet: string): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export const securityBlocks: BlockDefinition[] = [
  {
    id: 'security.mask',
    version: '1',
    labelKey: 'blocks.security.mask.label',
    descriptionKey: 'blocks.security.mask.description',
    keywords: ['безопасность', 'маска', 'скрыть', 'звёздочки', 'телефон'],
    category: 'security',
    subcategory: 'защита данных',
    difficulty: 'basic',
    status: 'implemented',
    inputs: [dport('text', 'blocks.ports.text', 'text')],
    outputs: [dport('text', 'blocks.ports.text', 'text')],
    defaults: { keep: 2 },
    runtime: ({ inputs, config }) => {
      const text = String(inputs.text ?? '');
      const keep = Math.max(0, Math.floor(Number(config.keep) || 0));
      const masked = text.length <= keep ? text : '•'.repeat(Math.max(0, text.length - keep)) + text.slice(-keep);
      return { outputs: { text: masked } };
    },
    ui: { icon: '🎭', color: securityColor },
  },
  {
    id: 'security.hash',
    version: '1',
    labelKey: 'blocks.security.hash.label',
    descriptionKey: 'blocks.security.hash.description',
    keywords: ['безопасность', 'хеш', 'сумма', 'отпечаток', 'сравнение'],
    category: 'security',
    subcategory: 'защита данных',
    difficulty: 'advanced',
    status: 'implemented',
    inputs: [dport('text', 'blocks.ports.text', 'text')],
    outputs: [dport('hash', 'blocks.ports.hash', 'text')],
    runtime: ({ inputs }) => ({ outputs: { hash: fnv1aHex(String(inputs.text ?? '')) } }),
    ui: { icon: '#️⃣', color: securityColor },
  },
  {
    id: 'security.generate_id',
    version: '1',
    labelKey: 'blocks.security.generate_id.label',
    descriptionKey: 'blocks.security.generate_id.description',
    keywords: ['безопасность', 'идентификатор', 'случайный', 'создать'],
    category: 'security',
    subcategory: 'генераторы',
    difficulty: 'basic',
    status: 'implemented',
    inputs: [],
    outputs: [dport('id', 'blocks.ports.id', 'text')],
    defaults: { length: 12 },
    runtime: ({ config }) => {
      const length = Math.min(64, Math.max(4, Math.floor(Number(config.length) || 12)));
      return { outputs: { id: randomString(length, ID_ALPHABET) } };
    },
    ui: { icon: '🆔', color: securityColor },
  },
  {
    id: 'security.token_generate',
    version: '1',
    labelKey: 'blocks.security.token_generate.label',
    descriptionKey: 'blocks.security.token_generate.description',
    keywords: ['безопасность', 'токен', 'ключ', 'случайный', 'код'],
    category: 'security',
    subcategory: 'генераторы',
    difficulty: 'basic',
    status: 'implemented',
    inputs: [],
    outputs: [dport('token', 'blocks.ports.token', 'text')],
    defaults: { length: 24 },
    runtime: ({ config }) => {
      const length = Math.min(128, Math.max(8, Math.floor(Number(config.length) || 24)));
      return { outputs: { token: randomString(length, ID_ALPHABET) } };
    },
    ui: { icon: '🎟️', color: securityColor },
  },
  {
    id: 'security.validate_email',
    version: '1',
    labelKey: 'blocks.security.validate_email.label',
    descriptionKey: 'blocks.security.validate_email.description',
    keywords: ['безопасность', 'почта', 'проверка', 'адрес', 'валидация'],
    category: 'security',
    subcategory: 'проверки',
    difficulty: 'basic',
    status: 'implemented',
    inputs: [dport('text', 'blocks.ports.text', 'text')],
    outputs: [dport('valid', 'blocks.ports.valid', 'boolean')],
    runtime: ({ inputs }) => {
      const email = String(inputs.text ?? '').trim();
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
      return { outputs: { valid } };
    },
    ui: { icon: '📧', color: securityColor },
  },
  {
    id: 'security.sanitize_html',
    version: '1',
    labelKey: 'blocks.security.sanitize_html.label',
    descriptionKey: 'blocks.security.sanitize_html.description',
    keywords: ['безопасность', 'очистка', 'теги', 'разметка', 'инъекция'],
    category: 'security',
    subcategory: 'защита данных',
    difficulty: 'advanced',
    status: 'implemented',
    inputs: [dport('text', 'blocks.ports.text', 'text')],
    outputs: [dport('text', 'blocks.ports.text', 'text')],
    runtime: ({ inputs }) => {
      const clean = String(inputs.text ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return { outputs: { text: clean } };
    },
    ui: { icon: '🧼', color: securityColor },
  },
  {
    id: 'security.secret_get',
    version: '1',
    labelKey: 'blocks.security.secret_get.label',
    descriptionKey: 'blocks.security.secret_get.description',
    keywords: ['безопасность', 'секрет', 'ключ', 'пароль', 'токен'],
    category: 'security',
    subcategory: 'секреты',
    difficulty: 'advanced',
    status: 'planned',
    available: false,
    inputs: [dport('name', 'blocks.ports.name', 'text')],
    outputs: [dport('secret', 'blocks.ports.secret', 'secret'), eport()],
    ui: { icon: '🗝️', color: securityColor },
  },
  {
    id: 'security.secret_list',
    version: '1',
    labelKey: 'blocks.security.secret_list.label',
    descriptionKey: 'blocks.security.secret_list.description',
    keywords: ['безопасность', 'секрет', 'список', 'имена'],
    category: 'security',
    subcategory: 'секреты',
    difficulty: 'advanced',
    status: 'planned',
    available: false,
    inputs: [],
    outputs: [dport('names', 'blocks.ports.names', 'array'), eport()],
    ui: { icon: '🗒️', color: securityColor },
  },
  {
    id: 'security.rate_limit',
    version: '1',
    labelKey: 'blocks.security.rate_limit.label',
    descriptionKey: 'blocks.security.rate_limit.description',
    keywords: ['безопасность', 'лимит', 'частота', 'защита от спама'],
    category: 'security',
    subcategory: 'ограничения',
    difficulty: 'advanced',
    status: 'planned',
    available: false,
    inputs: [dport('value', 'blocks.ports.value', 'any')],
    outputs: [dport('value', 'blocks.ports.value', 'any'), eport()],
    defaults: { maxPerMinute: 10 },
    ui: { icon: '🚦', color: securityColor },
  },
  {
    id: 'security.audit_log',
    version: '1',
    labelKey: 'blocks.security.audit_log.label',
    descriptionKey: 'blocks.security.audit_log.description',
    keywords: ['безопасность', 'журнал', 'аудит', 'событие', 'след'],
    category: 'security',
    subcategory: 'журналирование',
    difficulty: 'advanced',
    status: 'planned',
    available: false,
    inputs: [dport('event', 'blocks.ports.event', 'text')],
    outputs: [dport('ok', 'blocks.ports.ok', 'boolean')],
    ui: { icon: '📜', color: securityColor },
  },
];
