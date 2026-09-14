/**
 * Наблюдатель активного урока (подэтап 5.11).
 *
 * Запускает урок по параметру `?lesson=` в учебном проекте, собирает
 * снимок состояния при каждом изменении схемы/запусков и отдаёт его
 * движку проверки; открывает панель отладки, когда шаг этого требует.
 */

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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

  const lesson = lessonParam !== null ? getLesson(lessonParam) : undefined;
  const project = useProjectStore((s) => s.project);
  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);
  const selectedNodeId = useProjectStore((s) => s.selectedNodeId);
  const runStatus = useExecutionStore((s) => s.status);
  const historyLength = useExecutionStore((s) => s.history.length);
  const debugOpen = useUiStore((s) => s.debugOpen);

  const active = useTutorialStore((s) => s.active);
  const stepIndex = useTutorialStore((s) => s.stepIndex);
  const startedFor = useRef<string | null>(null);

  // Запуск урока: только в учебном проекте этого урока.
  useEffect(() => {
    if (lesson === undefined || project === null) return;
    if (project.meta.tutorial?.lessonId !== lesson.id) return;
    if (startedFor.current === lesson.id) return;
    startedFor.current = lesson.id;
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

  // Проверка текущего шага при любом изменении состояния.
  useEffect(() => {
    if (!active) return;
    useTutorialStore.getState().evaluate(buildAcademySnapshot());
  }, [active, nodes, edges, selectedNodeId, historyLength, debugOpen, stepIndex]);

  // Шаги про панель отладки/симлятор/чат/историю: открываем и включаем вкладку.
  const stepTarget = active && lesson !== undefined ? lesson.steps[stepIndex]?.target : undefined;
  useEffect(() => {
    if (stepTarget === undefined) return;
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
  }, [stepTarget]);

  return null;
}
