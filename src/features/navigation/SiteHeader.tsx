import { useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { primaryLinks, workspaceLinks, isEditorPath } from './navigation';

/** Компактный вариант того же меню используется в редакторе, без второй шапки. */
export function SiteMenu() {
  const { t } = useTranslation();
  const ref = useRef<HTMLDetailsElement>(null);
  const location = useLocation();
  return <details key={location.pathname + location.search} ref={ref} className="site-menu" data-site-menu onKeyDown={(e) => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); ref.current?.removeAttribute('open'); ref.current?.querySelector('summary')?.focus(); }
  }}>
    <summary title={t('navigation.menu')} className="site-menu-trigger">{t('navigation.menu')} <span aria-hidden="true">⌄</span></summary>
    <nav className="site-menu-content" aria-label={t('navigation.allSections')}>
      {[...primaryLinks, ...workspaceLinks].map((item) => <Link key={item.id} to={item.to} onClick={() => ref.current?.removeAttribute('open')}>
        <span>{t(`navigation.links.${item.id}`)}</span>{'planned' in item && item.planned === true && <small>{t('navigation.soon')}</small>}
      </Link>)}
      <Link to="/dashboard?section=account" onClick={() => ref.current?.removeAttribute('open')}>{t('navigation.account')}</Link>
    </nav>
  </details>;
}

export function SiteHeader() {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  if (isEditorPath(pathname)) return null;
  return <header className="site-header" data-testid="site-header">
    <div className="site-header-main">
      <Link to="/" className="site-brand" aria-label={t('navigation.homeLabel')}>
        <span className="site-brand-mark"><img src="/favicon.svg" alt="" width="28" height="28" /></span>
        <span><strong>NODEZZLE<span className="site-brand-dot">.</span></strong><small>{t('navigation.tagline')}</small></span>
      </Link>
      <nav className="site-primary-nav" aria-label={t('navigation.primary')}>
        {primaryLinks.map((item) => <NavLink key={item.id} to={item.to} end={item.to === '/' || item.to === '/dashboard'}>
          {t(`navigation.links.${item.id}`)}{'planned' in item && item.planned === true && <span className="site-soon-dot" title={t('navigation.soon')} aria-label={t('navigation.soon')} />}
        </NavLink>)}
      </nav>
      <div className="site-header-actions">
        <Link to="/dashboard?section=account" className="site-account">{t('navigation.account')}</Link>
        <Link to="/dashboard" className="site-open-projects">{t('navigation.openProjects')} <span aria-hidden="true">↗</span></Link>
        <div className="site-mobile-menu"><SiteMenu /></div>
      </div>
    </div>
    <div className="site-header-strip">
      <span className="site-workspace-label"><span aria-hidden="true">◇</span> {t('navigation.workspace')}</span>
      <nav className="site-secondary-nav" aria-label={t('navigation.quick')}>
        {workspaceLinks.slice(0, 3).map((item) => <Link key={item.id} to={item.to} aria-current={pathname + search === item.to ? 'page' : undefined}>{t(`navigation.links.${item.id}`)}</Link>)}
      </nav>
      <span className="site-header-note">{t('navigation.note')}</span>
      <div className="site-desktop-menu"><SiteMenu /></div>
    </div>
  </header>;
}
