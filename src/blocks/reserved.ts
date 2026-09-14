/**
 * Зарезервированные архитектурно детали (available: false).
 *
 * Они зарегистрированы в реестре (документация архитектуры,
 * стабильные id и контракты портов), но скрыты из палитры,
 * пока runtime не реализован. Реализация — по ROADMAP.
 */

import type { BlockDefinition } from '@/core/types/blocks';
import { dport, eport } from './shared';

export const reservedBlocks: BlockDefinition[] = [
  {
    id: 'memory.variable',
    labelKey: 'blocks.memory.variable.label',
    descriptionKey: 'blocks.memory.variable.description',
    category: 'memory',
    difficulty: 'advanced',
    available: false,
    inputs: [dport('value', 'blocks.ports.value', 'any')],
    outputs: [dport('value', 'blocks.ports.value', 'any')],
    defaults: { name: '' },
    ui: { icon: '🧠', color: '#fb923c' },
  },
  {
    id: 'memory.shared',
    labelKey: 'blocks.memory.shared.label',
    descriptionKey: 'blocks.memory.shared.description',
    category: 'memory',
    difficulty: 'advanced',
    available: false,
    inputs: [dport('value', 'blocks.ports.value', 'any')],
    outputs: [dport('value', 'blocks.ports.value', 'any')],
    defaults: { key: '' },
    ui: { icon: '🗄️', color: '#fb923c' },
  },
  {
    id: 'error.handle',
    labelKey: 'blocks.error.handle.label',
    descriptionKey: 'blocks.error.handle.description',
    category: 'flow',
    difficulty: 'advanced',
    available: false,
    inputs: [dport('error', 'blocks.ports.error', 'error')],
    outputs: [dport('message', 'blocks.ports.text', 'text'), eport()],
    ui: { icon: '🚨', color: '#f87171' },
  },
  {
    id: 'event.send',
    labelKey: 'blocks.event.send.label',
    descriptionKey: 'blocks.event.send.description',
    category: 'flow',
    difficulty: 'advanced',
    available: false,
    inputs: [dport('payload', 'blocks.ports.payload', 'any')],
    outputs: [],
    defaults: { name: '' },
    ui: { icon: '📣', color: '#e879f9' },
  },
  {
    id: 'event.receive',
    labelKey: 'blocks.event.receive.label',
    descriptionKey: 'blocks.event.receive.description',
    category: 'flow',
    difficulty: 'advanced',
    available: false,
    trigger: true,
    inputs: [],
    outputs: [dport('payload', 'blocks.ports.payload', 'any')],
    defaults: { name: '' },
    matches: () => false, // реальная маршрутизация событий — ROADMAP
    ui: { icon: '📡', color: '#e879f9' },
  },
  {
    id: 'http.request',
    labelKey: 'blocks.http.request.label',
    descriptionKey: 'blocks.http.request.description',
    category: 'http',
    difficulty: 'advanced',
    available: false,
    inputs: [dport('url', 'blocks.ports.url', 'url'), dport('body', 'blocks.ports.payload', 'json')],
    outputs: [dport('response', 'blocks.ports.data', 'json'), eport()],
    defaults: { method: 'GET', url: '' },
    ui: { icon: '🌍', color: '#38bdf8' },
  },
  {
    id: 'ai.text',
    labelKey: 'blocks.ai.text.label',
    descriptionKey: 'blocks.ai.text.description',
    category: 'ai',
    difficulty: 'advanced',
    available: false,
    inputs: [dport('prompt', 'blocks.ports.text', 'text'), dport('context', 'blocks.ports.data', 'json')],
    outputs: [dport('text', 'blocks.ports.text', 'text'), eport()],
    defaults: { prompt: '' },
    ui: { icon: '✨', color: '#e879f9' },
  },
];


