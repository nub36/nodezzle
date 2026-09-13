/**
 * Hero-анимация главной страницы: отдельные светящиеся детали
 * (Telegram, Логика, Модель, Ответ) постепенно соединяются
 * в работающую систему. Чистый CSS + SMIL, без зависимостей.
 */

import { useTranslation } from 'react-i18next';

export function Hero() {
  const { t } = useTranslation();

  return (
    <div className="relative mx-auto h-[420px] w-full max-w-[560px]">
      {/* Линии-соединения между деталями */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 560 420"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <path className="hero-line" d="M150 120 C 240 60, 300 70, 380 100" />
        <path className="hero-line" d="M420 150 C 460 210, 450 250, 420 300" />
        <path className="hero-line" d="M150 200 C 220 260, 300 300, 370 320" />
        <path className="hero-line" d="M200 350 C 280 370, 340 360, 400 340" />

        {/* Светящиеся частицы — направление движения данных */}
        <circle className="hero-particle" r="4">
          <animateMotion dur="2.6s" repeatCount="indefinite" path="M150 120 C 240 60, 300 70, 380 100" />
        </circle>
        <circle className="hero-particle" r="4">
          <animateMotion dur="2.6s" begin="0.9s" repeatCount="indefinite" path="M420 150 C 460 210, 450 250, 420 300" />
        </circle>
        <circle className="hero-particle" r="4">
          <animateMotion dur="2.6s" begin="1.7s" repeatCount="indefinite" path="M150 200 C 220 260, 300 300, 370 320" />
        </circle>
      </svg>

      {/* Детали */}
      <div className="hero-chip" style={{ top: 84, left: 24, ['--glow-delay' as string]: '0s' }}>
        <span>📨</span> {t('landing.hero.chips.telegram')}
      </div>
      <div className="hero-chip" style={{ top: 96, right: 20, ['--glow-delay' as string]: '0.8s' }}>
        <span>⚙️</span> {t('landing.hero.chips.logic')}
      </div>
      <div className="hero-chip" style={{ top: 288, left: 96, ['--glow-delay' as string]: '1.6s' }}>
        <span>📦</span> {t('landing.hero.chips.model')}
      </div>
      <div className="hero-chip" style={{ top: 312, right: 56, ['--glow-delay' as string]: '2.4s' }}>
        <span>💬</span> {t('landing.hero.chips.reply')}
      </div>

      {/* Готовая система */}
      <div className="hero-system-ring" />
    </div>
  );
}
