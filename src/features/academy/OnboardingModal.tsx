/**
 * Онбординг первого запуска (5.11G): «Что хотите собрать?».
 *
 * Показывается один раз (пока `progress.onboarding.done !== true`),
 * всегда можно пропустить — обучение никогда не запирает пользователя.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAcademyStore } from '@/store/academy-store';

type Choice = 'telegram' | 'web' | 'explore';

const TARGETS: Record<Choice, string> = {
  telegram: '/academy/lesson/telegram-first-bot',
  web: '/academy/lesson/web-first-page',
  explore: '/academy/lesson/intro-what',
};

const OPTIONS: Array<{ choice: Choice; icon: string; titleKey: string; textKey: string }> = [
  { choice: 'telegram', icon: '🤖', titleKey: 'academy.onboarding.optionTelegramTitle', textKey: 'academy.onboarding.optionTelegramText' },
  { choice: 'web', icon: '🌐', titleKey: 'academy.onboarding.optionWebTitle', textKey: 'academy.onboarding.optionWebText' },
  { choice: 'explore', icon: '🎓', titleKey: 'academy.onboarding.optionExploreTitle', textKey: 'academy.onboarding.optionExploreText' },
];

export function OnboardingModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const done = useAcademyStore((s) => s.progress.onboarding.done);
  const completeOnboarding = useAcademyStore((s) => s.completeOnboarding);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  if (done) return null;

  const pick = (choice: Choice) => {
    completeOnboarding(choice);
    navigate(TARGETS[choice]);
  };

  const skip = () => {
    completeOnboarding(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/80 p-4" role="presentation">
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('academy.onboarding.title')}
        tabIndex={-1}
        className="glass-strong w-full max-w-lg rounded-2xl border border-line/70 p-6 outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Escape') skip();
        }}
      >
        <h2 className="text-gradient mb-1 text-2xl font-black tracking-tight">{t('academy.onboarding.title')}</h2>
        <p className="mb-5 text-sm text-muted">{t('academy.onboarding.subtitle')}</p>
        <div className="space-y-2">
          {OPTIONS.map(({ choice, icon, titleKey, textKey }) => (
            <button
              key={choice}
              onClick={() => pick(choice)}
              className="glass block w-full rounded-xl px-4 py-3 text-left transition-all hover:border-cyan-400/40 hover:shadow-[0_0_24px_rgba(34,211,238,0.12)] focus-visible:border-cyan-400/60"
            >
              <div className="flex items-center gap-3">
                <span aria-hidden className="text-2xl">{icon}</span>
                <div>
                  <div className="text-sm font-bold">{t(titleKey)}</div>
                  <div className="text-xs text-muted">{t(textKey)}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between">
          <button className="btn-ghost !py-1.5 text-xs" onClick={skip}>
            {t('academy.onboarding.skip')}
          </button>
          <span className="text-[10px] text-muted/70">{t('academy.onboarding.hint')}</span>
        </div>
      </div>
    </div>
  );
}
