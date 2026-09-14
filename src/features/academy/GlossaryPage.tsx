/**
 * Глоссарий терминов Академии (5.11): короткие русские определения
 * понятий продукта. Термины — данные (список ключей), тексты — в i18n.
 */

import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const TERMS = [
  'piece', 'input', 'output', 'port', 'connection', 'trigger',
  'schema', 'canvas', 'inspector', 'sandbox', 'simulator', 'model',
  'draft', 'live', 'publish', 'debug',
] as const;

export function GlossaryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="aurora min-h-screen bg-abyss text-ink">
      <main className="mx-auto max-w-3xl px-4 py-8">
        <button className="btn-ghost mb-4 !py-1.5 text-xs" onClick={() => navigate('/academy')}>
          ← {t('academy.glossary.backToAcademy')}
        </button>
        <h1 className="text-gradient mb-1 text-3xl font-black tracking-tight">{t('academy.glossary.title')}</h1>
        <p className="mb-6 text-sm text-muted">{t('academy.glossary.subtitle')}</p>
        <dl className="space-y-3">
          {TERMS.map((term) => (
            <div key={term} className="glass rounded-2xl px-4 py-3">
              <dt className="mb-1 text-sm font-bold">{t(`academy.glossary.items.${term}.term`)}</dt>
              <dd className="text-xs leading-relaxed text-muted">{t(`academy.glossary.items.${term}.def`)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6">
          <Link to="/academy/reference" className="btn-ghost !py-1.5 text-xs">
            📚 {t('academy.reference.open')}
          </Link>
        </div>
      </main>
    </div>
  );
}
