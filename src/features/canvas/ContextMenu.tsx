/**
 * Контекстное меню Canvas (Этап 2, подэтап F).
 *
 * Правый клик по детали: дублировать, копировать, отключить, удалить,
 * следование связям, добавить заметку. Правый клик по холсту: добавить заметку.
 */

import { useEffect } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: string;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
  onClick: () => void;
}

export function CanvasContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* Прозрачная подложка: клик мимо закрывает меню */}
      <div className="pointer-events-auto absolute inset-0 z-20" onClick={onClose} onContextMenu={(e) => e.preventDefault()} />
      <div className="glass-strong pointer-events-auto absolute z-30 w-56 rounded-xl p-1.5" style={{ left: x, top: y }}>
        {items.map((item, i) =>
          item.divider ? (
            <div key={i} className="mx-2 my-1 h-px bg-line/70" />
          ) : (
            <button
              key={i}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                item.disabled
                  ? 'cursor-default text-muted/40'
                  : item.danger
                    ? 'text-red-300 hover:bg-red-400/10'
                    : 'text-ink hover:bg-cyan-400/10'
              }`}
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                item.onClick();
                onClose();
              }}
            >
              {item.icon && <span aria-hidden="true">{item.icon}</span>}
              <span className="flex-1">{item.label}</span>
            </button>
          ),
        )}
      </div>
    </>
  );
}
