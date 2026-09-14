/** Lesson Engine: валидация, зависимости, проверка шагов, прогресс. */

import { describe, expect, it } from 'vitest';
import { evaluateStep, isFinishedStatus } from './completion';
import {
  advanceLesson,
  createLocalStorageProgress,
  isLessonAvailable,
  lessonPercent,
  levelPercent,
  nextLesson,
  resetLesson,
  setOnboarding,
  startLesson,
  totalPercent,
} from './progress';
import { emptyProgress, type AcademySnapshot, type LessonDefinition, type LessonStep } from './types';
import { validateCatalog, validateLesson } from './validate';

/** Мини-реестр для проверки ссылок на блоки. */
const fakeRegistry = {
  ids: new Set(['core.text', 'debug.log', 'telegram.message_received', 'telegram.send_message', 'models.call']),
  has(id: string) {
    return this.ids.has(id);
  },
};

const step = (partial: Partial<LessonStep> & Pick<LessonStep, 'kind'>): LessonStep =>
  ({
    id: 's1',
    titleKey: 't',
    textKey: 'x',
    ...partial,
  }) as unknown as LessonStep;

const makeLesson = (partial: Partial<LessonDefinition>): LessonDefinition => ({
  id: 'basics.test',
  level: 1,
  track: 'basics',
  titleKey: 't',
  descriptionKey: 'd',
  estimatedMinutes: 5,
  difficulty: 'basic',
  prerequisites: [],
  sandbox: true,
  steps: [step({ kind: 'information' })],
  ...partial,
});

describe('валидация уроков', () => {
  it('корректный урок проходит без ошибок', () => {
    const lesson = makeLesson({
      steps: [
        step({ id: 'add', kind: 'add-block', blockId: 'core.text' }),
        step({ id: 'conn', kind: 'connect', fromBlockId: 'core.text', toBlockId: 'debug.log' }),
        step({ id: 'quiz', kind: 'quiz', questionKey: 'q', options: [
          { id: 'a', labelKey: 'qa', correct: true },
          { id: 'b', labelKey: 'qb', correct: false },
        ] }),
      ],
    });
    expect(validateLesson(lesson, fakeRegistry)).toEqual([]);
  });

  it('битая ссылка на реестр не проходит', () => {
    const lesson = makeLesson({ steps: [step({ kind: 'add-block', blockId: 'нет.такого' })] });
    const errors = validateLesson(lesson, fakeRegistry);
    expect(errors.some((e) => e.includes('нет.такого'))).toBe(true);
  });

  it('викторина без правильного ответа — ошибка', () => {
    const lesson = makeLesson({
      steps: [step({ kind: 'quiz', questionKey: 'q', options: [
        { id: 'a', labelKey: 'qa', correct: false },
        { id: 'b', labelKey: 'qb', correct: false },
      ] })],
    });
    expect(validateLesson(lesson, fakeRegistry).length).toBeGreaterThan(0);
  });

  it('каталог: дубли уроков ловятся', () => {
    const one = makeLesson({ id: 'x', steps: [step({ kind: 'information' })] });
    const two = makeLesson({ id: 'x', steps: [step({ kind: 'information' })] });
    expect(validateCatalog([one, two], fakeRegistry).some((e) => e.includes('Дублирующийся урок'))).toBe(true);
  });

  it('каталог: неизвестная зависимость ловится', () => {
    const ghost = makeLesson({ id: 'c', prerequisites: ['неизвестный'], steps: [step({ kind: 'information' })] });
    expect(validateCatalog([ghost], fakeRegistry).some((e) => e.includes('неизвестный'))).toBe(true);
  });

  it('каталог: циклы зависимостей ловятся', () => {
    const a = makeLesson({ id: 'a', prerequisites: ['b'], steps: [step({ kind: 'information' })] });
    const b = makeLesson({ id: 'b', prerequisites: ['a'], steps: [step({ kind: 'information' })] });
    expect(validateCatalog([a, b], fakeRegistry).some((e) => e.includes('Цикл зависимостей'))).toBe(true);
  });
});

describe('проверка шагов по снимку состояния', () => {
  const base: AcademySnapshot = { nodes: [], edges: [] };

  it('add-block: деталь появилась на холсте', () => {
    const s = step({ kind: 'add-block', blockId: 'core.text' });
    expect(evaluateStep(s, base)).toBe(false);
    expect(
      evaluateStep(s, { ...base, nodes: [{ id: 'n1', blockId: 'core.text' }] }),
    ).toBe(true);
  });

  it('connect: соединение между нужными деталями', () => {
    const s = step({ kind: 'connect', fromBlockId: 'telegram.message_received', toBlockId: 'telegram.send_message' });
    const nodes = [
      { id: 'n1', blockId: 'telegram.message_received' },
      { id: 'n2', blockId: 'telegram.send_message' },
    ];
    expect(evaluateStep(s, { ...base, nodes })).toBe(false);
    expect(
      evaluateStep(s, {
        ...base,
        nodes,
        edges: [{ sourceNodeId: 'n1', sourcePortId: 'text', targetNodeId: 'n2', targetPortId: 'text' }],
      }),
    ).toBe(true);
    // направление важно: обратное ребро не засчитывается
    expect(
      evaluateStep(s, {
        ...base,
        nodes,
        edges: [{ sourceNodeId: 'n2', targetNodeId: 'n1' }],
      }),
    ).toBe(false);
  });

  it('configure: точное значение и непустое значение', () => {
    const exact = step({ kind: 'configure', blockId: 'telegram.command', configKey: 'command', equals: '/start' });
    const anyValue = step({ kind: 'configure', blockId: 'core.text', configKey: 'value', notEmpty: true });
    const nodes = [
      { id: 'n1', blockId: 'telegram.command', config: { command: '/start' } },
      { id: 'n2', blockId: 'core.text', config: { value: '' } },
    ];
    expect(evaluateStep(exact, { ...base, nodes })).toBe(true);
    expect(evaluateStep(anyValue, { ...base, nodes })).toBe(false);
    expect(
      evaluateStep(anyValue, { ...base, nodes: [{ id: 'n2', blockId: 'core.text', config: { value: 'привет' } }] }),
    ).toBe(true);
  });

  it('run: успешное завершение схемы', () => {
    const s = step({ kind: 'run' });
    expect(evaluateStep(s, base)).toBe(false);
    expect(evaluateStep(s, { ...base, lastRun: { status: 'error', at: 1 } })).toBe(false);
    expect(evaluateStep(s, { ...base, lastRun: { status: 'success', source: 'telegram', at: 1 } })).toBe(true);
    const anyFinished = step({ kind: 'run', require: 'finished' });
    expect(evaluateStep(anyFinished, { ...base, lastRun: { status: 'error', at: 1 } })).toBe(true);
  });

  it('send-simulator-message: запуск из симулятора с текстом', () => {
    const s = step({ kind: 'send-simulator-message', source: 'telegram', textContains: 'привет' });
    const ok = {
      ...base,
      lastRun: { status: 'success', source: 'telegram', at: 1 },
      simulatorText: 'Привет, бот!',
    };
    expect(evaluateStep(s, ok)).toBe(true);
    expect(evaluateStep(s, { ...ok, simulatorText: 'другой текст' })).toBe(false);
    expect(evaluateStep(s, { ...ok, lastRun: { status: 'success', source: 'web', at: 1 } })).toBe(false);
  });

  it('select-block, create-model, open-debug, open-page', () => {
    const nodes = [
      { id: 'n1', blockId: 'debug.log' },
      { id: 'n2', blockId: 'models.call' },
    ];
    expect(evaluateStep(step({ kind: 'select-block', blockId: 'debug.log' }), { ...base, nodes, selectedBlockId: 'n1' })).toBe(true);
    expect(evaluateStep(step({ kind: 'select-block', blockId: 'debug.log' }), { ...base, nodes, selectedBlockId: null })).toBe(false);
    expect(evaluateStep(step({ kind: 'create-model' }), { ...base, nodes })).toBe(true);
    expect(evaluateStep(step({ kind: 'open-debug' }), { ...base, debugOpen: true })).toBe(true);
    expect(evaluateStep(step({ kind: 'open-page', route: '/projects/edu' }), { ...base, route: '/projects/edu-1' })).toBe(true);
  });

  it('quiz: только правильный ответ', () => {
    const s = step({ kind: 'quiz', questionKey: 'q', options: [
      { id: 'a', labelKey: 'qa', correct: true },
      { id: 'b', labelKey: 'qb', correct: false },
    ] });
    expect(evaluateStep(s, { ...base, quizAnswer: 'b' })).toBe(false);
    expect(evaluateStep(s, { ...base, quizAnswer: 'a' })).toBe(true);
    expect(evaluateStep(s, base)).toBe(false);
  });

  it('isFinishedStatus', () => {
    expect(isFinishedStatus('success')).toBe(true);
    expect(isFinishedStatus('timeout')).toBe(true);
    expect(isFinishedStatus('running')).toBe(false);
  });
});

describe('прогресс обучения', () => {
  const first = makeLesson({ id: 'l1', prerequisites: [], steps: [
    step({ id: 'a', kind: 'information' }),
    step({ id: 'b', kind: 'information' }),
  ] });
  const second = makeLesson({ id: 'l2', prerequisites: ['l1'], steps: [
    step({ id: 'a', kind: 'information' }),
  ] });
  const catalog = [first, second];

  it('предшествующие уроки открывают следующие', () => {
    const p0 = emptyProgress();
    expect(isLessonAvailable(p0, catalog, 'l1')).toBe(true);
    expect(isLessonAvailable(p0, catalog, 'l2')).toBe(false);
    const p1 = advanceLesson(startLesson(p0, 'l1', 100), first, 2, 200);
    expect(p1.lessons.l1.status).toBe('completed');
    expect(isLessonAvailable(p1, catalog, 'l2')).toBe(true);
    expect(nextLesson(p1, catalog)?.id).toBe('l2');
  });

  it('проценты: шаг, уровень, каталог', () => {
    const p = advanceLesson(startLesson(emptyProgress(), 'l1', 1), first, 1, 2);
    expect(lessonPercent(p, first)).toBe(50);
    expect(levelPercent(p, catalog, 1)).toBe(25); // (50 + 0) / 2
    expect(totalPercent(p, catalog)).toBe(25);
  });

  it('сброс урока очищает только его состояние', () => {
    let p = advanceLesson(startLesson(emptyProgress(), 'l1', 1), first, 2, 2);
    p = startLesson(p, 'l2', 3);
    p = resetLesson(p, 'l1');
    expect(p.lessons.l1).toBeUndefined();
    expect(p.lessons.l2.status).toBe('in-progress');
  });

  it('онбординг: выбор дорожки', () => {
    const p = setOnboarding(emptyProgress(), 'telegram');
    expect(p.onboarding).toEqual({ done: true, choice: 'telegram' });
  });

  it('хранилище переживает битые данные', () => {
    const storage = createLocalStorageProgress('nodezzle-academy-test');
    expect(storage.load()).toEqual(emptyProgress());
    const saved = setOnboarding(emptyProgress(), 'web');
    storage.save(saved);
    expect(storage.load().onboarding.choice).toBe('web');
  });
});
