/**
 * Наблюдатель активного урока (подэтап 5.11).
 *
 * Запускает урок по параметру `?lesson=` в учебном проекте, собирает
 * снимок состояния при каждом изменении схемы/запусков и отдаёт его
 * движку проверки; открывает панель отладки, когда шаг этого требует.
 */

import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { getLesson } from '@/academy/catalog';
import { useExecutionStore } from '@/store/execution-store';
import { useProjectStore } from '@/store/project-store';
import { useTutorialStore } from '@/store/tutorial-store';
import { useAcademyStore } from '@/store/academy-store';
import { useUiStore } from '@/store/ui-store';
import { buildAcademySnapshot, effectiveRunSource } from './snapshot';

export function TutorialWatcher() {
  const [searchParams] = useSearchParams();
  const lessonParam = searchParams.get('lesson');
  const location = useLocation();

  const lesson = lessonParam !== null ? getLesson(lessonParam) : undefined;
  const project = useProjectStore((s) => s.project);
  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);
  const selectedNodeId = useProjectStore((s) => s.selectedNodeId);
  const runStatus = useExecutionStore((s) => s.status);
  const panelTab = useExecutionStore((s) => s.panelTab);
  // История ограничена 30 записями; новый запуск узнаём по ID, не по длине.
  const lastRunId = useExecutionStore((s) => s.history[0]?.id);
  const debugOpen = useUiStore((s) => s.debugOpen);

  const active = useTutorialStore((s) => s.active);
  const stepIndex = useTutorialStore((s) => s.stepIndex);
  const recheckTick = useTutorialStore((s) => s.recheckTick);
  const startedFor = useRef<string | null>(null);

  // Запуск урока: уроки с песочницей — только в учебном проекте урока;
  // уроки без песочницы (знакомство) стартуют на любой странице с ?lesson=.
  useEffect(() => {
    if (lesson === undefined) return;
    if (lesson.sandbox) {
      if (project === null) return;
      if (project.meta.tutorial?.lessonId !== lesson.id) return;
    }
    if (startedFor.current === lesson.id) return;
    startedFor.current = lesson.id;
    // Нынешние уроки отправляют сообщения: callback-режим из другого проекта не переносим.
    useExecutionStore.getState().setPayload({ telegramEvent: 'message' });
    const resumeStep = useAcademyStore.getState().progress.lessons[lesson.id]?.stepIndex ?? 0;
    useTutorialStore.getState().start(lesson.id, resumeStep);
  }, [lesson, project]);

  // Остановка, если ушли с учебного маршрута.
  useEffect(() => {
    if (lessonParam === null && useTutorialStore.getState().lesson !== null) {
      useTutorialStore.getState().stop();
      startedFor.current = null;
    }
  }, [lessonParam]);

  // Запоминаем источник и текст запуска при завершении выполнения.
  const prevStatus = useRef(runStatus);
  useEffect(() => {
    if (prevStatus.current === 'running' && runStatus !== 'running') {
      const payload = useExecutionStore.getState().payload;
      const canvasNodes = useProjectStore.getState().nodes.map((n) => ({ blockId: n.data.blockId }));
      const source = effectiveRunSource(payload.source, canvasNodes);
      useTutorialStore.getState().recordRun(
        runStatus,
        source,
        source === 'telegram' ? payload.text : payload.webJson,
      );
    }
    prevStatus.current = runStatus;
  }, [runStatus]);

  // Синхронизация «панель отладки открыта» для снимка.
  useEffect(() => {
    useTutorialStore.getState().setDebugOpen(debugOpen);
  }, [debugOpen]);

  // Вставка автоматически выделяет новую деталь. При входе в учебный
  // шаг «Выберите» снимаем это выделение ОДИН раз, до проверки снимка:
  // пользователь должен сам кликнуть по детали, а не пропустить практику.
  // Только песочница текущего урока; документ и рабочие проекты не меняются.
  useEffect(() => {
    if (!active || !lesson?.sandbox || project?.meta.tutorial?.lessonId !== lesson.id) return;
    if (lesson.steps[stepIndex]?.kind === 'select-block') {
      useProjectStore.getState().selectNode(null);
    }
  }, [active, lesson, stepIndex, project?.id]);

  // Проверка текущего шага при любом изменении состояния.
  // Нормализованные события моста выводятся самим стором внутри
  // `evaluate` (единственный источник истины — сторы продукта).
  useEffect(() => {
    if (!active) return;
    useTutorialStore.getState().evaluate(buildAcademySnapshot());
  }, [active, nodes, edges, selectedNodeId, lastRunId, debugOpen, panelTab, stepIndex, recheckTick, location]);

  // Подсветка не должна выполнять за ученика действие «откройте вкладку».
  // В информационных шагах и шагах запуска автопоказ цели сохраняется.
  const currentStep = active && lesson !== undefined ? lesson.steps[stepIndex] : undefined;
  const stepTarget = currentStep?.target;
  const manualTab = currentStep?.kind === 'open-debug' && currentStep.tab !== undefined;
  useEffect(() => {
    if (stepTarget === undefined || manualTab) return;
    const tabByTarget: Record<string, 'simulator' | 'chat' | 'history' | null> = {
      simulator: 'simulator',
      chat: 'chat',
      history: 'history',
      debug: null,
    };
    if (!(stepTarget in tabByTarget)) return;
    useUiStore.getState().setDebugOpen(true);
    const tab = tabByTarget[stepTarget];
    if (tab !== null) useExecutionStore.getState().setPanelTab(tab);
  }, [stepTarget, manualTab]);

  return null;
}
