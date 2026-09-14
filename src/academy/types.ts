/**
 * Академия NODEZZLE — Lesson Engine (подэтап 5.11).
 *
 * Урок — это данные (LessonDefinition), а не React-страница: движок
 * проверяет шаги по снимку состояния продукта (AcademySnapshot) и
 * автоматически засчитывает выполненные действия. См. docs/ACADEMY.md.
 *
 * Всё содержимое для пользователя — через i18n-ключи (поля `*Key`).
 */

import type { DebugPanelTab } from '@/lib/debug-tabs';

/** Уровни обучения (порядок дорожек в Академии). */
export type LessonLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Дорожка (тематическая группа уроков). */
export type LessonTrack = 'basics' | 'telegram' | 'web' | 'models' | 'debug' | 'publish' | 'advanced';

/** Элемент интерфейса, который подсвечивает оверлей на этом шаге. */
export type TutorialTarget =
  | 'library' // библиотека деталей
  | 'canvas' // холст
  | 'inspector' // инспектор
  | 'run' // кнопка «Запустить»
  | 'debug' // панель отладки
  | 'simulator' // вкладка «Симулятор»
  | 'chat' // вкладка «Чат»
  | 'history' // вкладка «История»
  | 'toolbar' // тулбар
  | 'none';

/** Общие поля шага. Текст — только i18n-ключи. */
interface StepBase {
  /** Уникален в пределах урока. */
  id: string;
  titleKey: string;
  textKey: string;
  /** Теория по запросу; основная инструкция остаётся короткой. */
  detailsKey?: string;
  /** Дополнительная подсказка (показывается по кнопке/бездействию). */
  hintKey?: string;
  target?: TutorialTarget;
}

/** Прочитать и нажать «Далее». */
export interface InformationStep extends StepBase {
  kind: 'information';
}

/** Перейти на страницу (завершается, когда маршрут совпал). */
export interface OpenPageStep extends StepBase {
  kind: 'open-page';
  route: string;
}

/** Добавить деталь на холст (проверяется по составу схемы). */
export interface AddBlockStep extends StepBase {
  kind: 'add-block';
  /** Обязан существовать в реестре блоков (валидируется). */
  blockId: string;
}

/** Соединить порты двух деталей (проверяется по рёбрам). */
export interface ConnectStep extends StepBase {
  kind: 'connect';
  fromBlockId: string;
  toBlockId: string;
  /** Если не указаны — подходит любой порт. */
  fromPortId?: string;
  toPortId?: string;
}

/** Настроить деталь (проверяется по конфигурации узла). */
export interface ConfigureStep extends StepBase {
  kind: 'configure';
  blockId: string;
  configKey: string;
  /** Точное совпадение значения. */
  equals?: unknown;
  /** Альтернатива: значение непустое/истинное. */
  notEmpty?: boolean;
}

/** Запустить схему (проверяется по последнему выполнению). */
export interface RunStep extends StepBase {
  kind: 'run';
  /** 'success' — успешно; 'finished' — любое завершённое. */
  require?: 'success' | 'finished';
}

/** Отправить сообщение через симулятор и запустить. */
export interface SendSimulatorMessageStep extends StepBase {
  kind: 'send-simulator-message';
  source: 'telegram' | 'web';
  /** Текст симулятора должен содержать подстроку (необязательно). */
  textContains?: string;
}

/** Выбрать деталь на холсте. */
export interface SelectBlockStep extends StepBase {
  kind: 'select-block';
  blockId: string;
}

/** Создать модель (появился узел «Вызов модели»). */
export interface CreateModelStep extends StepBase {
  kind: 'create-model';
}

/** Открыть панель отладки. */
export interface OpenDebugStep extends StepBase {
  kind: 'open-debug';
  /** Если задана, нужна именно эта вкладка открытой панели. */
  tab?: DebugPanelTab;
}

/** Посмотреть публикацию/версии (честный статус функции — в тексте). */
export interface PublishPreviewStep extends StepBase {
  kind: 'publish-preview';
}

/** Вопрос с вариантами ответа. */
export interface QuizStep extends StepBase {
  kind: 'quiz';
  questionKey: string;
  options: Array<{ id: string; labelKey: string; correct: boolean }>;
}

export type LessonStep =
  | InformationStep
  | OpenPageStep
  | AddBlockStep
  | ConnectStep
  | ConfigureStep
  | RunStep
  | SendSimulatorMessageStep
  | SelectBlockStep
  | CreateModelStep
  | OpenDebugStep
  | PublishPreviewStep
  | QuizStep;

/** Урок. Проверяемые действия — только по реально работающим функциям. */
export interface LessonDefinition {
  /** Уникальный идентификатор: `<дорожка>.<имя>`. */
  id: string;
  level: LessonLevel;
  track: LessonTrack;
  titleKey: string;
  descriptionKey: string;
  estimatedMinutes: number;
  difficulty: 'basic' | 'advanced';
  /** Идентификаторы уроков, которые должны быть завершены раньше. */
  prerequisites: string[];
  /** Нужен ли учебный проект-песочница. */
  sandbox: boolean;
  steps: LessonStep[];
  /** Детали, о которых рассказывает урок (для перекрёстных ссылок). */
  relatedBlockIds?: string[];
  /**
   * Честность: если урок касается незавершённой функции — ключ пояснения
   * («Запланировано…»). Интерактивные шаги по несуществующим функциям
   * запрещены (см. валидацию).
   */
  plannedNoteKey?: string;
}

/** Узел в снимке состояния (минимально необходимое движку). */
export interface SnapshotNode {
  id: string;
  blockId: string;
  config?: Record<string, unknown>;
}

/** Ребро в снимке состояния. */
export interface SnapshotEdge {
  sourceNodeId: string;
  sourcePortId?: string;
  targetNodeId: string;
  targetPortId?: string;
}

/**
 * Снимок состояния продукта, по которому проверяются шаги.
 * Собирается адаптером из сторов (см. tutorial-store) — движок чистый.
 */
export interface AcademySnapshot {
  nodes: SnapshotNode[];
  edges: SnapshotEdge[];
  /** ТИП выбранной детали (идентификатор определения, напр. 'core.text'). */
  selectedBlockId?: string | null;
  /** Экземпляр выбранного узла на холсте (для событий/диагностики). */
  selectedNodeId?: string | null;
  /** Последнее завершённое выполнение (если было). */
  lastRun?: { status: string; source?: string; at: number } | null;
  /** Сколько сообщений бот отправил в outbox за текущую сессию. */
  outboxCount?: number;
  debugOpen?: boolean;
  debugTab?: DebugPanelTab;
  route?: string;
  /** Выбранный ответ текущего шага-викторины. */
  quizAnswer?: string | null;
  /** Пользователь нажал «Понятно/Далее» на информационном шаге. */
  acknowledged?: boolean;
  /** Фактический текст симулятора последнего запуска. */
  simulatorText?: string;
}

export type LessonStatus = 'not-started' | 'in-progress' | 'completed';

export interface LessonProgress {
  status: LessonStatus;
  /** Индекс текущего шага (для завершённых — количество шагов). */
  stepIndex: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface OnboardingState {
  done: boolean;
  choice: 'telegram' | 'web' | 'explore' | null;
}

export interface AcademyProgress {
  lessons: Record<string, LessonProgress>;
  onboarding: OnboardingState;
}

export const emptyProgress = (): AcademyProgress => ({
  lessons: {},
  onboarding: { done: false, choice: null },
});
