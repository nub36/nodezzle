/**
 * Проверка выполнения шагов урока по снимку состояния.
 * Чистые функции — тестируются без React и без DOM.
 *
 * Правило: пользователь не нажимает «Я сделал» там, где действие можно
 * проверить автоматически (состав схемы, соединения, запуск, ответы).
 */

import type { AcademySnapshot, LessonStep, RunOutputExpectation } from './types';

const FINISHED_STATUSES = new Set(['success', 'error', 'stopped', 'timeout']);

function nodeBlockIds(snapshot: AcademySnapshot): Set<string> {
  return new Set(snapshot.nodes.map((n) => n.blockId));
}

function blockIdOfNode(snapshot: AcademySnapshot, nodeId: string): string | null {
  const node = snapshot.nodes.find((n) => n.id === nodeId);
  return node !== undefined ? node.blockId : null;
}

/** Есть ли ребро между деталями нужных типов (и портов, если заданы). */
function hasConnection(snapshot: AcademySnapshot, step: {
  fromBlockId: string;
  toBlockId: string;
  fromPortId?: string;
  toPortId?: string;
}): boolean {
  return snapshot.edges.some((edge) => {
    const from = blockIdOfNode(snapshot, edge.sourceNodeId);
    const to = blockIdOfNode(snapshot, edge.targetNodeId);
    if (from !== step.fromBlockId || to !== step.toBlockId) return false;
    // Если урок требует конкретный порт — совпадение обязательно:
    // соединение «не тем портом» шаг не завершает.
    if (step.fromPortId !== undefined && edge.sourcePortId !== step.fromPortId) {
      return false;
    }
    if (step.toPortId !== undefined && edge.targetPortId !== step.toPortId) {
      return false;
    }
    return true;
  });
}

/** Проверяем реальные выходы успешно исполненных деталей. Ложные/нулевые значения допустимы. */
function hasExpectedOutputs(snapshot: AcademySnapshot, expected: RunOutputExpectation[] | undefined): boolean {
  if (expected === undefined) return true;
  return expected.every((requirement) => snapshot.lastRun?.results?.some((result) => {
    if (result.blockId !== requirement.blockId || result.status !== 'success') return false;
    if (!Object.hasOwn(result.outputs, requirement.portId)) return false;
    const value = result.outputs[requirement.portId];
    if (value === undefined) return false;
    return requirement.equals === undefined || JSON.stringify(value) === JSON.stringify(requirement.equals);
  }) === true);
}

/**
 * Выполнен ли шаг при данном состоянии. Для шагов, требующих действия
 * пользователя (прочитать, ответить), результат зависит от данных снимка
 * (ответ викторины, маршрут) — «Далее» нажимает интерфейс только после
 * положительного результата.
 *
 * `stepStartedAt` — момент, когда шаг стал текущим: шаги «запустить»
 * требуют НОВОГО запуска, а не сделанного до появления шага.
 */
export function evaluateStep(step: LessonStep, snapshot: AcademySnapshot, stepStartedAt = 0): boolean {
  switch (step.kind) {
    case 'information':
      // Чтение нельзя проверить автоматически: засчитывает интерфейс,
      // когда пользователь нажал «Понятно» (признак в снимке).
      return snapshot.acknowledged === true;
    case 'open-page':
      return snapshot.route !== undefined && snapshot.route.startsWith(step.route);
    case 'add-block':
      return nodeBlockIds(snapshot).has(step.blockId);
    case 'connect':
      return hasConnection(snapshot, step);
    case 'configure': {
      const node = snapshot.nodes.find((n) => n.blockId === step.blockId);
      if (node === undefined || node.config === undefined) return false;
      const value = node.config[step.configKey];
      if (step.notEmpty === true) {
        return value !== undefined && value !== null && value !== '';
      }
      return value !== undefined && JSON.stringify(value) === JSON.stringify(step.equals);
    }
    case 'run': {
      const run = snapshot.lastRun;
      if (run === undefined || run === null) return false;
      if (run.at < stepStartedAt) return false; // старый запуск не в счёт
      if (!hasExpectedOutputs(snapshot, step.expectedOutputs)) return false;
      if (step.require === 'finished') return FINISHED_STATUSES.has(run.status);
      return run.status === 'success';
    }
    case 'send-simulator-message': {
      const run = snapshot.lastRun;
      if (run === undefined || run === null) return false;
      if (run.at < stepStartedAt) return false; // старый запуск не в счёт
      if (run.status !== 'success') return false;
      if (run.source !== step.source) return false;
      if (!hasExpectedOutputs(snapshot, step.expectedOutputs)) return false;
      if (step.textContains !== undefined) {
        const text = typeof snapshot.simulatorText === 'string' ? snapshot.simulatorText : '';
        if (!text.toLowerCase().includes(step.textContains.toLowerCase())) return false;
      }
      return true;
    }
    case 'select-block':
      // snapshot.selectedBlockId — это ТИП детали (напр. 'core.text'),
      // а не экземпляр узла на холсте: сверяем тип с требуемым.
      return snapshot.selectedBlockId === step.blockId;
    case 'create-model':
      return nodeBlockIds(snapshot).has('models.call');
    case 'open-debug':
      return snapshot.debugOpen === true && (step.tab === undefined || snapshot.debugTab === step.tab);
    case 'publish-preview':
      // Пользователь увидел панель публикации — засчитывает интерфейс.
      return snapshot.acknowledged === true;
    case 'quiz': {
      const answer = snapshot.quizAnswer;
      if (answer === undefined || answer === null) return false;
      const option = step.options.find((o) => o.id === answer);
      return option !== undefined && option.correct === true;
    }
    default:
      return false;
  }
}

/** Завершённые статусы исполнения — для справки интерфейсу. */
export function isFinishedStatus(status: string): boolean {
  return FINISHED_STATUSES.has(status);
}
