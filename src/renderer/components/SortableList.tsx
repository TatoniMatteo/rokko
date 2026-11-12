import { useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../preferences/i18n';
export function SortableList({ ids, render, onMove, label = id => id, onContext, disabled = false }: {
  ids: string[]; onContext?: (id: string) => void; label?: (id: string) => string; render: (id: string) => ReactNode;
  onMove: (id: string, target: string, after: boolean) => Promise<unknown>; disabled?: boolean;
}) {
  const t = useI18n();
  const drag = useRef<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [pending, setPending] = useState(false);
  const locked = disabled || pending;
  async function move(id: string, target: string, after: boolean) {
    if (locked || id === target) return;
    setPending(true);
    try { const result = await onMove(id, target, after); if (result !== false) setAnnouncement(t('Order updated')); }
    finally { setPending(false); }
  }
  return <div className="sort-list"><span className="sr-only" role="status">{announcement}</span>
    <p className="sr-only">{t('Drag to reorder. Keyboard: Space to pick up, arrows to move, Space to finish.')}</p>
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
      <button className="drag-handle" type="button" aria-disabled={locked}
        title={t('Drag to reorder. Keyboard: Space to pick up, arrows to move, Space to finish.')}
        aria-label={t('Reorder {name}', { name: label(id) })} aria-pressed={picked === id}
        onKeyDown={event => {
          if (locked) return;
          if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); setPicked(picked === id ? null : id); }
          else if (event.key === 'Escape') { setPicked(null); }
          else if (picked === id && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault(); const offset = event.key === 'ArrowUp' ? -1 : 1;
            const target = ids[ids.indexOf(id) + offset]; if (target) void move(id, target, offset > 0);
          }
        }}><span aria-hidden="true"/></button>{render(id)}
    </div>)}
  </div>;
}
