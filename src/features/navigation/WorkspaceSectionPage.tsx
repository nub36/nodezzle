import { Link, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { plannedSections, type PlannedSection } from './navigation';

/** Честная оболочка будущих разделов: никаких запросов записи и поддельных данных. */
export function WorkspaceSectionPage() {
  const { section } = useParams();
  const { t } = useTranslation();
  if (!plannedSections.includes(section as PlannedSection)) return <Navigate to="/dashboard" replace />;
  const actions = t(`navigation.sections.${section}.actions`, { returnObjects: true }) as string[];
  return <main className="workspace-page" data-testid="workspace-section">
    <div className="workspace-breadcrumb">{t('navigation.workspace')} <span aria-hidden="true">/</span> {t(`navigation.links.${section}`)}</div>
    <section className="workspace-intro">
      <div><span className="workspace-eyebrow">{t('navigation.prepared')}</span>
        <h1>{t(`navigation.links.${section}`)}</h1><p>{t(`navigation.sections.${section}.description`)}</p>
      </div>
      <span className="workspace-status"><span />{t('navigation.soon')}</span>
    </section>
    <div className="workspace-grid">
      <section className="workspace-card">
        <h2>{t('navigation.plannedActions')}</h2>
        <p className="workspace-notice" role="status">{t('navigation.notImplemented')}</p>
        <div className="workspace-action-list">{actions.map((action, index) => <div key={action}>
          <span className="workspace-action-number">0{index + 1}</span>
          <span>{action}</span><button disabled aria-label={action} title={t('navigation.notImplemented')}>{t('navigation.soon')}</button>
        </div>)}</div>
      </section>
      <aside className="workspace-card workspace-next">
        <span className="workspace-eyebrow">{t('navigation.availableNow')}</span>
        <h2>{t('navigation.keepBuilding')}</h2>
        <p>{t('navigation.availableHint')}</p>
        <Link className="site-open-projects" to="/dashboard">{t('navigation.openProjects')} ↗</Link>
        <Link to="/academy">{t('navigation.goLearn')} →</Link>
        <Link to="/dashboard?section=account">{t('navigation.account')} →</Link>
      </aside>
    </div>
  </main>;
}
