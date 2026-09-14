/**
 * NODEZZLE — формат проекта (Project Format).
 *
 * Единственный источник правды о структуре хранилища проекта:
 * Zod-схемы + выведенные TypeScript-типы. Полный документ —
 * docs/PROJECT_FORMAT.md.
 *
 * Правила расширяемости:
 * - `formatVersion` позволяет мигрировать старые проекты;
 * - неизвестные поля сохраняются (forward compatibility),
 *   явные нарушения — отклоняются при загрузке.
 */

import { z } from 'zod';

export const projectKindSchema = z.enum(['telegram', 'web', 'telegram-web', 'empty']);
export type ProjectKind = z.infer<typeof projectKindSchema>;

export const viewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number().positive(),
});
export type ViewportState = z.infer<typeof viewportSchema>;

export const canvasNodeSchema = z.object({
  id: z.string().min(1),
  /** Ссылка на Block Definition (реестр блоков). */
  blockId: z.string().min(1),
  /** Необязательная переименовка экземпляра пользователем. */
  label: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }),
  /** Значения конфигурации конкретного экземпляра блока. */
  config: z.record(z.string(), z.unknown()),
});
export type CanvasNode = z.infer<typeof canvasNodeSchema>;

export const canvasEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  sourcePort: z.string().min(1),
  target: z.string().min(1),
  targetPort: z.string().min(1),
});
export type CanvasEdge = z.infer<typeof canvasEdgeSchema>;

/** Визуальная группа деталей (рамка на холсте), Этап 2 подэтап F часть 2.
 * Поле опционально — старые проекты остаются валидными без миграции. */
export const canvasGroupSchema = z.object({
  id: z.string().min(1),
  /** Название группы (показывается на рамке). */
  label: z.string().optional(),
  /** id деталей-участников (позиции хранят сами детали). */
  nodeIds: z.array(z.string().min(1)),
});
export type CanvasGroup = z.infer<typeof canvasGroupSchema>;

export const canvasDocumentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nodes: z.array(canvasNodeSchema),
  edges: z.array(canvasEdgeSchema),
  viewport: viewportSchema.optional(),
  /** Визуальные группы (рамки) — опционально, старые проекты валидны. */
  groups: z.array(canvasGroupSchema).optional(),
});
export type CanvasDocument = z.infer<typeof canvasDocumentSchema>;

/** Порт публичного контракта модели (INPUT/OUTPUT/ERROR модели). */
export const contractPortSchema = z.object({
  id: z.string().min(1),
  /** Человекочитаемое имя поля контракта. */
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().optional(),
});
export type ContractPort = z.infer<typeof contractPortSchema>;

/** Публичный контракт модели: из него автоматически строятся внешние порты. */
export const modelContractSchema = z.object({
  inputs: z.array(contractPortSchema),
  outputs: z.array(contractPortSchema),
  error: contractPortSchema.optional(),
  events: z.array(contractPortSchema).optional(),
});
export type ModelContract = z.infer<typeof modelContractSchema>;

/**
 * Сохранённая модель: контракт + внутренняя схема (canvas).
 * Модель — это «деталь из деталей»: её можно вставлять в другие схемы
 * блоком «Вызов модели» и открывать внутри (Drill Down).
 */
export const storedModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().min(1),
  contract: modelContractSchema,
  canvas: canvasDocumentSchema,
  updatedAt: z.number(),
});
export type StoredModel = z.infer<typeof storedModelSchema>;

export const projectVariableSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  value: z.unknown(),
  scope: z.literal('project'),
});
export type ProjectVariable = z.infer<typeof projectVariableSchema>;

export const nodezzleProjectSchema = z.object({
  /** Версия формата. Сейчас — 1 (см. docs/PROJECT_FORMAT.md). */
  formatVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  kind: projectKindSchema,
  /** Основная схема проекта. В будущем — массив canvases (см. ROADMAP). */
  canvas: canvasDocumentSchema,
  models: z.array(storedModelSchema),
  variables: z.array(projectVariableSchema),
  meta: z.object({
    createdAt: z.number(),
    updatedAt: z.number(),
    /**
     * Учебный проект-песочница Академии (подэтап 5.11): необязательное
     * поле — старые проекты остаются валидными без миграции.
     */
    tutorial: z.object({ lessonId: z.string().min(1) }).optional(),
  }),
});
export type NodezzleProject = z.infer<typeof nodezzleProjectSchema>;

/** Краткое описание проекта для списка Dashboard. */
export interface ProjectSummary {
  id: string;
  name: string;
  kind: ProjectKind;
  updatedAt: number;
  /** Заполнено для учебных проектов-песочниц Академии. */
  tutorial?: { lessonId: string };
}

/** Безопасная валидация произвольного JSON (возвращает null при несовпадении). */
export function tryParseProject(value: unknown): NodezzleProject | null {
  const result = nodezzleProjectSchema.safeParse(value);
  return result.success ? result.data : null;
}
