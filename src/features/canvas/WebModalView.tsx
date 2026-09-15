/** Локальный информационный диалог. Не отправляет событий в runtime. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useExecutionStore } from '@/store/execution-store';

export function WebModalView({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTranslation();
  const running = useExecutionStore((s) => s.running);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const name = title.trim() ? title : t('blocks.web.modal.label');

  useEffect(() => {
    if (running && dialog.current?.open) dialog.current.close();
  }, [running]);
  useEffect(() => {
    const current = dialog.current;
    return () => { if (current?.open) current.close(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const current = dialog.current;
      if (!current?.open) return;
      // Window capture идёт раньше document capture редактора/React Flow.
      // Защищает также случай, когда загрузка картинки убрала активную кнопку.
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault(); current.close(); return;
      }
      if (event.key !== 'Tab') return;
      const controls = [...current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      const inside = controls.includes(document.activeElement as HTMLElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault(); first?.focus();
      }
    };
    // После исчезновения сфокусированной кнопки (например, согласия на img)
    // браузер может оставить фокус на body. Возвращаем его в живой диалог.
    const observer = new MutationObserver(() => {
      if (dialog.current?.open && !dialog.current.contains(document.activeElement)) closer.current?.focus();
    });
    if (dialog.current) observer.observe(dialog.current, { childList: true, subtree: true });
    window.addEventListener('keydown', onKey, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return <div data-web-kind="modal" className="min-w-0">
    <button ref={opener} type="button" className="btn-ghost max-w-full whitespace-normal break-words text-xs"
      aria-haspopup="dialog" disabled={running} onClick={() => {
        if (running || !dialog.current || dialog.current.open) return;
        dialog.current.showModal();
        setOpen(true);
        closer.current?.focus();
      }}>{t('execution.panel.web.modalOpen', { title: name })}</button>
    <dialog ref={dialog} aria-labelledby={titleId}
      className="fixed inset-0 m-auto max-h-[80dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto rounded-xl border border-line bg-panel p-4 text-ink shadow-2xl backdrop:bg-black/70"
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); dialog.current?.close(); }}
      onClose={() => {
        if (dialog.current?.open) return;
        setOpen(false);
        if (opener.current?.isConnected && !opener.current.disabled) opener.current.focus();
      }}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <h2 id={titleId} className="min-w-0 whitespace-pre-wrap break-words text-lg font-bold">{name}</h2>
        <button ref={closer} type="button" className="btn-ghost shrink-0 text-xs" onClick={() => dialog.current?.close()}>{t('execution.panel.web.modalClose')}</button>
      </header>
      <p className="mb-3 text-xs text-muted">{t('execution.panel.web.modalLocal')}</p>
      {open && <div className="min-w-0 space-y-3">{children}</div>}
    </dialog>
  </div>;
}
