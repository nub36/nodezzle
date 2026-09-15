/** Внешний запрос — только после согласия. Ключ src в родителе сбрасывает согласие при смене URL. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function WebImageView({ src, caption }: { src: string; caption: string }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  return <figure data-web-kind="image" className="min-w-0 space-y-2 rounded-lg border border-line/60 p-2">
    <p className="break-all text-[11px] text-muted">{src}</p>
    {status === 'idle' && <p className="text-xs text-muted">{t('execution.panel.web.externalImage')}</p>}
    {(status === 'loading' || status === 'loaded') && <img
      src={src} alt={caption} referrerPolicy="no-referrer" decoding="async"
      className="max-h-80 max-w-full rounded object-contain"
      onLoad={() => setStatus('loaded')} onError={() => setStatus('error')}
    />}
    {status === 'loading' && <p role="status" className="text-xs text-muted">{t('execution.panel.web.imageLoading')}</p>}
    {status === 'error' && <p role="status" className="text-xs text-amber-200">{t('execution.panel.web.imageFailed')}</p>}
    {(status === 'idle' || status === 'error') && <button type="button" className="btn-ghost text-xs" onClick={() => setStatus('loading')}>
      {t(status === 'error' ? 'execution.panel.web.imageRetry' : 'execution.panel.web.imageLoad')}
    </button>}
    {caption !== '' && <figcaption className="whitespace-pre-wrap break-words text-xs text-ink">{caption}</figcaption>}
  </figure>;
}
