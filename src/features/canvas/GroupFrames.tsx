/**
 * Рамки групп на холсте (Этап 2, подэтап F часть 2).
 *
 * Группа — опциональное поле формата `CanvasDocument.groups`: id, подпись
 * и список деталей. Рамка рисуется поверх холста по габаритам участников:
 * клик по ярлыку выделяет участников (дальше их можно тащить как выделение),
 * перетаскивание ярлыка двигает всю группу, двойной клик — переименование,
 * крестик — убрать рамку (детали остаются на месте).
 */

import { useRef, useState } from 'react';
import { useViewport } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import type { CanvasGroup } from '@/core/project/schema';
import { useProjectStore } from '@/store/project-store';

const PAD = 26;
const FALLBACK_W = 220;
const FALLBACK_H = 96;

interface DragState {
  groupId: string;
  startX: number;
  startY: number;
  base: Record<string, { x: number; y: number }>;
  moved: boolean;
}

function GroupFrame({ group }: { group: CanvasGroup }) {
  const { t } = useTranslation();
  const nodes = useProjectStore((s) => s.nodes);
  const groups = useProjectStore((s) => s.groups);
  const selectNodeIds = useProjectStore((s) => s.selectNodeIds);
  const renameGroup = useProjectStore((s) => s.renameGroup);
  const ungroupGroup = useProjectStore((s) => s.ungroupGroup);
  const beginGroupDrag = useProjectStore((s) => s.beginGroupDrag);
  const moveGroupTo = useProjectStore((s) => s.moveGroupTo);
  const endGroupDrag = useProjectStore((s) => s.endGroupDrag);
  const { x, y, zoom } = useViewport();

  const dragRef = useRef<DragState | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const members = nodes.filter((n) => group.nodeIds.includes(n.id));
  if (members.length === 0) return null;

  const minX = Math.min(...members.map((n) => n.position.x)) - PAD;
  const minY = Math.min(...members.map((n) => n.position.y)) - PAD;
  const maxX = Math.max(...members.map((n) => n.position.x + (n.measured?.width ?? FALLBACK_W))) + PAD;
  const maxY = Math.max(...members.map((n) => n.position.y + (n.measured?.height ?? FALLBACK_H))) + PAD;

  const left = minX * zoom + x;
  const top = minY * zoom + y;
  const width = (maxX - minX) * zoom;
  const height = (maxY - minY) * zoom;

  // Ярлык группы виден даже за пределами рамки (на случай очень мелкого зума).
  const label = group.label ?? '';

  const onPointerDown = (e: React.PointerEvent) => {
    if (editing) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const base: Record<string, { x: number; y: number }> = {};
    for (const n of members) base[n.id] = { ...n.position };
    dragRef.current = { groupId: group.id, startX: e.clientX, startY: e.clientY, base, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / zoom;
    const dy = (e.clientY - drag.startY) / zoom;
    if (!drag.moved && Math.hypot(dx * zoom, dy * zoom) > 4) {
      drag.moved = true;
      beginGroupDrag();
    }
    if (!drag.moved) return;
    const next: Record<string, { x: number; y: number }> = {};
    for (const [id, pos] of Object.entries(drag.base)) {
      next[id] = { x: pos.x + dx, y: pos.y + dy };
    }
    moveGroupTo(drag.groupId, next);
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.moved) {
      endGroupDrag();
    } else {
      // Клик без сдвига: выделить всех участников группы.
      selectNodeIds(group.nodeIds);
    }
  };

  const ungroup = groups.some((g) => g.id === group.id);

  return (
    <div
      className="pointer-events-none absolute rounded-xl border border-dashed"
      style={{
        left,
        top,
        width,
        height,
        borderColor: 'rgba(148,163,184,0.4)',
        background: 'rgba(148,163,184,0.05)',
        zIndex: 4,
      }}
    >
      <div
        className="pointer-events-auto absolute -top-3 left-3 flex cursor-grab items-center gap-1.5 rounded-full border border-line bg-abyss px-2.5 py-1 text-[11px] font-semibold text-muted shadow-md transition-colors hover:text-ink active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => {
          setDraft(group.label ?? '');
          setEditing(true);
        }}
        title={t('canvas.group.labelHint')}
      >
        <span aria-hidden>▣</span>
        {editing ? (
          <input
            autoFocus
            className="w-28 bg-transparent text-[11px] text-ink outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                renameGroup(group.id, draft);
                setEditing(false);
              }
              if (e.key === 'Escape') setEditing(false);
            }}
            onBlur={() => {
              renameGroup(group.id, draft);
              setEditing(false);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span>{label || t('canvas.group.defaultName')}</span>
        )}
        {ungroup && !editing && (
          <button
            className="ml-1 text-muted transition-colors hover:text-red-300"
            title={t('canvas.group.ungroup')}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => ungroupGroup(group.id)}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export function GroupFrames() {
  const groups = useProjectStore((s) => s.groups);
  if (groups.length === 0) return null;
  return (
    <>
      {groups.map((g) => (
        <GroupFrame key={g.id} group={g} />
      ))}
    </>
  );
}
