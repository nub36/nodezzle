/** Рендерит только уже проверенное дерево. Атрибуты пользователя не распространяются в DOM. */
import { useTranslation } from 'react-i18next';
import { WebModalView } from './WebModalView';
import { WebFieldView } from './WebFieldView';
import { WebImageView } from './WebImageView';
import type { WebElement } from '@/core/web/layout-element';

export function WebElementView({ element }: { element: WebElement }) {
  const { t } = useTranslation();
  if (element.kind === 'modal') return <WebModalView key={JSON.stringify(element)} title={element.title}>
    {element.children.length ? element.children.map((child, index) => <WebElementView key={index} element={child} />)
      : <p className="text-xs text-muted">{t('execution.panel.web.emptyLayout')}</p>}
  </WebModalView>;
  if (element.kind === 'input' || element.kind === 'textarea') return <WebFieldView key={JSON.stringify(element)} element={element} />;
  if (element.kind === 'image') return <WebImageView key={element.src} src={element.src} caption={element.caption} />;
  if (element.kind === 'link') return <a data-web-kind="link" href={element.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" title={t('execution.panel.web.externalLink', { url: element.href })} className="block min-w-0 whitespace-pre-wrap break-words text-sm text-cyan-300 underline">{element.text.trim() ? element.text : element.href}<span className="sr-only"> — {t('execution.panel.web.newTab')}</span></a>;
  if (element.kind === 'text') return <p data-web-kind="text" className="min-w-0 whitespace-pre-wrap break-words text-sm text-ink">{element.text}</p>;
  if (element.kind === 'heading') {
    const Heading = `h${element.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    return <Heading data-web-kind="heading" className="min-w-0 whitespace-pre-wrap break-words font-bold text-ink" style={{ fontSize: `${1.75 - (element.level - 1) * 0.15}rem` }}>{element.text}</Heading>;
  }
  const Tag = element.kind === 'section' ? 'section' : 'div';
  return <Tag data-web-kind={element.kind} className="min-w-0 rounded-lg border border-line/60 p-3" aria-label={element.kind === 'section' ? element.title || undefined : undefined}>
    {element.kind === 'section' && element.title !== '' && <h2 className="mb-2 whitespace-pre-wrap break-words text-lg font-bold text-ink">{element.title}</h2>}
    {element.children.length === 0 ? <p className="text-xs text-muted">{t('execution.panel.web.emptyLayout')}</p> :
      <div className={element.kind === 'grid' ? 'grid gap-3' : 'space-y-3'} style={element.kind === 'grid' ? { gridTemplateColumns: `repeat(${element.columns}, minmax(0, 1fr))` } : undefined}>
        {element.children.map((child, index) => <WebElementView key={index} element={child} />)}
      </div>}
  </Tag>;
}
