/**
 * NODEZZLE — корневой компонент и роутинг.
 *
 * Экраны:
 *  /            — главная (Hero + Playground)
 *  /dashboard   — панель управления (проекты)
 *  /projects/:id — Canvas проекта
 *  /academy     — Академия: уровни и уроки (подэтап 5.11)
 *  /academy/lesson/:lessonId — страница урока
 *
 * HashRouter: работает из статической сборки (preview, gh-pages)
 * без настройки rewrite'ов (см. docs/DECISIONS.md, ADR-010).
 */

import { createHashRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom';
import { SiteHeader } from '@/features/navigation/SiteHeader';
import { WorkspaceSectionPage } from '@/features/navigation/WorkspaceSectionPage';
import { LandingPage } from '@/features/landing/LandingPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { ServerCanvasPage } from '@/features/projects/ServerCanvasPage';
import { SimpleEditorPage, SimpleStartPage } from '@/features/simple/SimpleEditorPage';
import { CanvasPage } from '@/features/canvas/CanvasPage';
import { AcademyPage } from '@/features/academy/AcademyPage';
import { LessonPage } from '@/features/academy/LessonPage';
import { BlockReferencePage } from '@/features/academy/BlockReferencePage';
import { GlossaryPage } from '@/features/academy/GlossaryPage';
import { TutorialWatcher } from '@/features/academy/TutorialWatcher';
import { TutorialOverlay } from '@/features/academy/TutorialOverlay';

// Data-router сохраняет hash-адреса и позволяет блокировать уход с несохранённого серверного Canvas.
const router = createHashRouter([{
  element: <><TutorialWatcher /><TutorialOverlay /><SiteHeader /><Outlet /></>,
  children: [
    { path: '/', element: <LandingPage /> },
    { path: '/workspace/:section', element: <WorkspaceSectionPage /> },
    { path: '/dashboard', element: <DashboardPage /> },
    { path: '/server-projects/:projectId', element: <ServerCanvasPage /> },
    { path: '/build', element: <SimpleStartPage /> },
    { path: '/build/:projectId', element: <SimpleEditorPage /> },
    { path: '/projects/:projectId', element: <CanvasPage /> },
    { path: '/academy', element: <AcademyPage /> },
    { path: '/academy/reference', element: <BlockReferencePage /> },
    { path: '/academy/glossary', element: <GlossaryPage /> },
    { path: '/academy/lesson/:lessonId', element: <LessonPage /> },
    { path: '*', element: <Navigate to="/" replace /> },
  ],
}]);
export default function App() { return <RouterProvider router={router} />; }
