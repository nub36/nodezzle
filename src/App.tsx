/**
 * NODEZZLE — корневой компонент и роутинг.
 *
 * Экраны:
 *  /            — главная (Hero + Playground)
 *  /dashboard   — панель управления (проекты)
 *  /projects/:id — Canvas проекта
 *
 * HashRouter: работает из статической сборки (preview, gh-pages)
 * без настройки rewrite'ов (см. docs/DECISIONS.md, ADR-010).
 */

import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LandingPage } from '@/features/landing/LandingPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { CanvasPage } from '@/features/canvas/CanvasPage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/projects/:projectId" element={<CanvasPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
