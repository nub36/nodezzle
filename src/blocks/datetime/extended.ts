/**
 * Расширенные детали даты и времени (Этап 4, часть E).
 *
 * Значения дат — строки в формате ISO (как у `datetime.now`).
 * Восемь деталей исполняемые (чистые преобразования), «Расписание»
 * запланировано до появления планировщика запусков.
 */

import type { BlockDefinition } from '@/core/types/blocks';
import { dport, eport, ERR } from '../shared';

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');

export const datetimeExtendedBlocks: BlockDefinition[] = [
  {
    id: 'datetime.format',
    version: '1',
    labelKey: 'blocks.datetime.format.label',
    descriptionKey: 'blocks.datetime.format.description',
    keywords: ['время', 'дата', 'формат', 'текст', 'вывод'],
    category: 'datetime',
    subcategory: 'преобразование',
    difficulty: 'basic',
    status: 'implemented',
    inputs: [dport('date', 'blocks.ports.date', 'date')],
    outputs: [dport('text', 'blocks.ports.text', 'text'), eport()],
    defaults: { mode: 'datetime' },
    runtime: ({ inputs, config }) => {
      const d = parseDate(inputs.date);
      if (!d) return { error: ERR.INVALID_DATE };
      const mode = String(config.mode ?? 'datetime');
      const locale = 'ru-RU';
      let text: string;
      if (mode === 'date') text = d.toLocaleDateString(locale);
      else if (mode === 'time') text = d.toLocaleTimeString(locale);
      else if (mode === 'iso') text = d.toISOString();
      else text = d.toLocaleString(locale);
      return { outputs: { text } };
    },
    ui: { icon: '📆', color: '#38bdf8' },
  },
  {
    id: 'datetime.add',
    version: '1',
    labelKey: 'blocks.datetime.add.label',
    descriptionKey: 'blocks.datetime.add.description',
    keywords: ['время', 'дата', 'плюс', 'добавить', 'сдвиг'],
    category: 'datetime',
    subcategory: 'арифметика',
    difficulty: 'basic',
    status: 'implemented',
    inputs: [dport('date', 'blocks.ports.date', 'date')],
    outputs: [dport('date', 'blocks.ports.date', 'date'), eport()],
    defaults: { amount: 1, unit: 'day' },
    runtime: ({ inputs, config }) => {
      const d = parseDate(inputs.date);
      if (!d) return { error: ERR.INVALID_DATE };
      const amount = Number(config.amount);
      if (!Number.isFinite(amount)) return { error: ERR.INVALID_NUMBER };
      const unit = String(config.unit ?? 'day');
      const result = new Date(d.getTime());
      if (unit === 'minute') result.setMinutes(result.getMinutes() + amount);
      else if (unit === 'hour') result.setHours(result.getHours() + amount);
      else if (unit === 'week') result.setDate(result.getDate() + amount * 7);
      else if (unit === 'month') result.setMonth(result.getMonth() + amount);
      else result.setDate(result.getDate() + amount);
      return { outputs: { date: result.toISOString() } };
    },
    ui: { icon: '➕', color: '#38bdf8' },
  },
  {
    id: 'datetime.diff',
    version: '1',
    labelKey: 'blocks.datetime.diff.label',
    descriptionKey: 'blocks.datetime.diff.description',
    keywords: ['время', 'дата', 'разница', 'между', 'длительность'],
    category: 'datetime',
    subcategory: 'арифметика',
    difficulty: 'advanced',
    status: 'implemented',
    inputs: [
      dport('from', 'blocks.ports.from', 'date'),
      dport('to', 'blocks.ports.to', 'date'),
    ],
    outputs: [dport('value', 'blocks.ports.value', 'number'), eport()],
    defaults: { unit: 'day' },
    runtime: ({ inputs, config }) => {
      const from = parseDate(inputs.from);
      const to = parseDate(inputs.to);
      if (!from || !to) return { error: ERR.INVALID_DATE };
      const ms = to.getTime() - from.getTime();
      const unit = String(config.unit ?? 'day');
      const per = { minute: 60_000, hour: 3_600_000, day: 86_400_000 } as Record<string, number>;
      const divisor = per[unit] ?? per.day;
      return { outputs: { value: Math.round((ms / divisor) * 100) / 100 } };
    },
    ui: { icon: '↔️', color: '#38bdf8' },
  },
  {
    id: 'datetime.timestamp',
    version: '1',
    labelKey: 'blocks.datetime.timestamp.label',
    descriptionKey: 'blocks.datetime.timestamp.description',
    keywords: ['время', 'дата', 'метка', 'миллисекунды', 'число'],
    category: 'datetime',
    subcategory: 'преобразование',
    difficulty: 'advanced',
    status: 'implemented',
    inputs: [dport('date', 'blocks.ports.date', 'date')],
    outputs: [dport('value', 'blocks.ports.value', 'number'), eport()],
    runtime: ({ inputs }) => {
      const d = parseDate(inputs.date);
      if (!d) return { error: ERR.INVALID_DATE };
      return { outputs: { value: d.getTime() } };
    },
    ui: { icon: '🔢', color: '#38bdf8' },
  },
  {
    id: 'datetime.from_timestamp',
    version: '1',
    labelKey: 'blocks.datetime.from_timestamp.label',
    descriptionKey: 'blocks.datetime.from_timestamp.description',
    keywords: ['время', 'дата', 'метка', 'из числа', 'восстановить'],
    category: 'datetime',
    subcategory: 'преобразование',
    difficulty: 'advanced',
    status: 'implemented',
    inputs: [dport('value', 'blocks.ports.value', 'number')],
    outputs: [dport('date', 'blocks.ports.date', 'date'), eport()],
    runtime: ({ inputs }) => {
      const n = Number(inputs.value);
      const d = Number.isFinite(n) ? new Date(n) : null;
      if (!d || Number.isNaN(d.getTime())) return { error: ERR.INVALID_DATE };
      return { outputs: { date: d.toISOString() } };
    },
    ui: { icon: '⏱️', color: '#38bdf8' },
  },
  {
    id: 'datetime.date_part',
    version: '1',
    labelKey: 'blocks.datetime.date_part.label',
    descriptionKey: 'blocks.datetime.date_part.description',
    keywords: ['время', 'дата', 'часть', 'год', 'месяц', 'день'],
    category: 'datetime',
    subcategory: 'части',
    difficulty: 'basic',
    status: 'implemented',
    inputs: [dport('date', 'blocks.ports.date', 'date')],
    outputs: [dport('text', 'blocks.ports.text', 'text'), eport()],
    runtime: ({ inputs }) => {
      const d = parseDate(inputs.date);
      if (!d) return { error: ERR.INVALID_DATE };
      return { outputs: { text: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` } };
    },
    ui: { icon: '📅', color: '#38bdf8' },
  },
  {
    id: 'datetime.time_part',
    version: '1',
    labelKey: 'blocks.datetime.time_part.label',
    descriptionKey: 'blocks.datetime.time_part.description',
    keywords: ['время', 'дата', 'часть', 'часы', 'минуты', 'секунды'],
    category: 'datetime',
    subcategory: 'части',
    difficulty: 'basic',
    status: 'implemented',
    inputs: [dport('date', 'blocks.ports.date', 'date')],
    outputs: [dport('text', 'blocks.ports.text', 'text'), eport()],
    runtime: ({ inputs }) => {
      const d = parseDate(inputs.date);
      if (!d) return { error: ERR.INVALID_DATE };
      return { outputs: { text: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` } };
    },
    ui: { icon: '⌚', color: '#38bdf8' },
  },
  {
    id: 'datetime.weekday',
    version: '1',
    labelKey: 'blocks.datetime.weekday.label',
    descriptionKey: 'blocks.datetime.weekday.description',
    keywords: ['время', 'дата', 'день недели', 'понедельник'],
    category: 'datetime',
    subcategory: 'части',
    difficulty: 'basic',
    status: 'implemented',
    inputs: [dport('date', 'blocks.ports.date', 'date')],
    outputs: [dport('value', 'blocks.ports.value', 'number'), eport()],
    runtime: ({ inputs }) => {
      const d = parseDate(inputs.date);
      if (!d) return { error: ERR.INVALID_DATE };
      // 1 — понедельник … 7 — воскресенье
      return { outputs: { value: d.getDay() === 0 ? 7 : d.getDay() } };
    },
    ui: { icon: '🗓️', color: '#38bdf8' },
  },
  {
    id: 'datetime.schedule',
    version: '1',
    labelKey: 'blocks.datetime.schedule.label',
    descriptionKey: 'blocks.datetime.schedule.description',
    keywords: ['время', 'расписание', 'по часам', 'ежедневно', 'триггер'],
    category: 'datetime',
    subcategory: 'триггеры',
    difficulty: 'advanced',
    status: 'planned',
    available: false,
    trigger: true,
    inputs: [],
    outputs: [dport('tick', 'blocks.ports.tick', 'date')],
    ui: { icon: '⏰', color: '#38bdf8' },
  },
];
