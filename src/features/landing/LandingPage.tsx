/**
 * Главная страница NODEZZLE.
 *
 * Задача: сразу визуально объяснить продукт — Hero с соединяющимися
 * деталями, Playground (принцип без регистрации), возможности.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Hero } from './Hero';
import { Playground } from './Playground';

export function LandingPage() {
  const { t } = useTranslation();

  const features = [
    { icon: '🧩', title: t('landing.features.canvas.title'), text: t('landing.features.canvas.text') },
    { icon: '📦', title: t('landing.features.models.title'), text: t('landing.features.models.text') },
    { icon: '🔀', title: t('landing.features.platforms.title'), text: t('landing.features.platforms.text') },
    { icon: '⚡', title: t('landing.features.runtime.title'), text: t('landing.features.runtime.text') },
    { icon: '🔗', title: t('landing.features.types.title'), text: t('landing.features.types.text') },
    { icon: '🇷🇺', title: t('landing.features.i18n.title'), text: t('landing.features.i18n.text') },
  ];

  return (
    <div className="aurora noise min-h-screen">
      <div className="aurora-blob aurora-blob--blue" />
      <div className="aurora-blob aurora-blob--purple" />
      <div className="aurora-blob aurora-blob--cyan" />

      {/* Навигация */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="text-lg font-extrabold tracking-wide text-gradient">NODEZZLE</span>
        </Link>
        <nav className="flex items-center gap-1">
          <a href="#features" className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-ink">
            {t('landing.nav.features')}
          </a>
          <a href="#playground" className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-ink">
            {t('landing.nav.playground')}
          </a>
          <Link to="/dashboard" className="btn-ghost ml-2 !px-4 !py-2 text-sm">
            {t('landing.nav.dashboard')}
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-10 px-6 pb-16 pt-10 md:grid-cols-2 md:pt-16">
        <div>
          <h1 className="text-6xl font-extrabold tracking-tight md:text-7xl">
            <span className="text-gradient">NODEZZLE</span>
          </h1>
          <p className="mt-4 text-2xl font-bold">{t('landing.hero.subtitle')}</p>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">{t('landing.hero.lead')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/dashboard" className="btn-primary">
              {t('landing.hero.cta')}
            </Link>
            <a href="#playground" className="btn-ghost">
              {t('landing.hero.ctaSecondary')}
            </a>
          </div>
        </div>
        <Hero />
      </section>

      {/* Playground */}
      <div className="relative z-10 mx-auto w-full max-w-6xl">
        <Playground />
      </div>

      {/* Возможности */}
      <section id="features" className="relative z-10 mx-auto w-full max-w-6xl px-6 py-20">
        <h2 className="mb-10 text-center text-3xl font-bold tracking-tight">
          {t('landing.features.title')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="glass card-hover rounded-2xl p-5">
              <div className="mb-3 text-2xl">{f.icon}</div>
              <div className="mb-1.5 text-sm font-bold">{f.title}</div>
              <div className="text-xs leading-relaxed text-muted">{f.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-line/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-2 px-6 py-8 text-center">
          <div className="text-sm font-bold text-gradient">NODEZZLE</div>
          <div className="text-xs text-muted">{t('landing.footer.rights')}</div>
        </div>
      </footer>
    </div>
  );
}
