import { useId, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../preferences/i18n';
export function SortableList({ ids, render, onMove, label = id => id, onContext, disabled = false }: {
  ids: string[]; onContext?: (id: string) => void; label?: (id: string) => string; render: (id: string) => ReactNode;
  onMove: (id: string, target: string, after: boolean) => Promise<unknown>; disabled?: boolean;
}) {
  const t = useI18n();
  const instructions = useId();
  const drag = useRef<string | null>(null);
  const originIndex = useRef(0);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [pending, setPending] = useState(false);
  const locked = disabled || pending;
  async function move(id: string, target: string, after: boolean) {
    if (locked || id === target) return;
    setPending(true);
    try { const result = await onMove(id, target, after); if (result !== false) {
      const order = ids.filter(value => value !== id); order.splice(order.indexOf(target) + (after ? 1 : 0), 0, id);
      setAnnouncement(t('{name} moved to position {position} of {count}', { name: label(id), position: order.indexOf(id) + 1, count: ids.length }));
      if (picked === id) requestAnimationFrame(() => handles.current.get(id)?.focus());
    } }
    finally { setPending(false); }
  }
  return <div className="sort-list"><span className="sr-only" role="status">{announcement}</span>
    <p className="sr-only" id={instructions}>{t('Drag to reorder. Keyboard: Space to pick up, arrows to move, Space to finish.')}</p>
    {ids.map(id => <div className={`sort-row ${over?.id === id ? over.after ? 'drop-after' : 'drop-before' : ''}`}
      key={id} data-sort-id={id} onContextMenu={onContext ? event => { event.preventDefault(); onContext(id); } : undefined} draggable={!locked} onDragStart={event => {
        if (locked || (event.target as HTMLElement).closest('input,.icon-btn')) { event.preventDefault(); return; }
        drag.current = id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id);
      }} onDragEnd={() => { drag.current = null; setOver(null); }} onDragOver={event => {
        if (!drag.current || locked) return;
        event.preventDefault(); event.dataTransfer.dropEffect = 'move';
        const rect = event.currentTarget.getBoundingClientRect();
        setOver({ id, after: event.clientY > rect.top + rect.height / 2 });
      }} onDrop={event => {
        event.preventDefault(); const from = drag.current;
        const rect = event.currentTarget.getBoundingClientRect();
        drag.current = null; setOver(null);
        if (from && ids.includes(from)) void move(from, id, event.clientY > rect.top + rect.height / 2);
      }}>
      <button ref={node => { if (node) handles.current.set(id, node); else handles.current.delete(id); }} className="drag-handle" type="button" aria-disabled={locked}
        data-tooltip={t('Drag to reorder. Keyboard: Space to pick up, arrows to move, Space to finish.')}
        aria-label={t('Reorder {name}', { name: label(id) })} aria-pressed={picked === id}
        aria-describedby={instructions} onClick={() => {
          if (locked) return;
          originIndex.current = ids.indexOf(id);
          setPicked(picked === id ? null : id);
          setAnnouncement(t(picked === id ? '{name} placed.' : '{name} picked up. Use arrow keys to move.', { name: label(id) }));
        }}
        onKeyDown={event => {
          if (locked) return;
          if (event.key === 'Escape' && picked === id) {
            event.preventDefault(); const current = ids.indexOf(id); const target = ids[originIndex.current];
            if (target && current !== originIndex.current) void move(id, target, current < originIndex.current);
            setPicked(null);
          }
          else if (picked === id && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault(); const offset = event.key === 'ArrowUp' ? -1 : 1;
            const target = ids[ids.indexOf(id) + offset]; if (target) void move(id, target, offset > 0);
          }
        }}><span aria-hidden="true"/></button>{render(id)}
    </div>)}
  </div>;
}
