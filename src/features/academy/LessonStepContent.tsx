/** Короткая инструкция и необязательная теория — одинаково в уроке и на холсте. */
import { useTranslation } from 'react-i18next';
import type { LessonStep } from '@/academy/types';

export function LessonStepContent({ step }: { step: LessonStep }) {
  const { t } = useTranslation();
  return (
    <div className="text-xs leading-relaxed">
      <p className="text-muted">{t(step.textKey)}</p>
      {step.detailsKey !== undefined && (
        <details key={step.detailsKey} className="mt-2 rounded-lg border border-line/60 px-2.5 py-1.5" data-testid="lesson-step-details">
          <summary className="cursor-pointer text-cyan-300 focus-visible:outline-cyan-300">
            {t('academy.lesson.more')}
          </summary>
          <p className="mt-2 text-muted">{t(step.detailsKey)}</p>
        </details>
      )}
    </div>
  );
}
