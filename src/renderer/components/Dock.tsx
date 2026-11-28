import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { AppData, AppSnapshot, ContextMenuRequest } from '../../shared/contracts/model';
import type { Preferences } from '../../shared/preferences/preferences.mjs';
import { orderedCards } from '../../shared/preferences/preferences.mjs';
import { Icon } from './Icon';
import { ServiceIcon } from './ServiceIcon';
import logo from '../../../assets/brand/rokko-dark-icon.png';
import { useI18n } from '../preferences/i18n';
export function WorkspaceMark({ name, index = 0 }: { name: string | null; index?: number }) {
  return <span className="workspace-mark"
    style={{ '--workspace-hue': (index * 67 + 180) % 360 } as React.CSSProperties} aria-hidden="true">
    {name ? Array.from(name.trim())[0]?.toLocaleUpperCase() : <Icon name="globe" size={14}/>}</span>;
}
type DockItem = { kind: 'app' | 'workspace'; id: string };
type DropTarget = DockItem & { after: boolean };

function dockItem(element: HTMLElement): DockItem {
  const key = element.dataset.dockItem!;
  return key.startsWith('app:')
    ? { kind: 'app', id: key.slice(4) }
    : { kind: 'workspace', id: key.slice(10) };
}

export function Dock({ data, lifecycle, preferences, activeId, page, onHome, onSettings, onSearch, onApp, onMoveApp, onMoveWorkspace, onContext, disabled }: {
  data: AppData; lifecycle: AppSnapshot; preferences: Preferences; activeId: string | null; page: string;
  onHome: () => void; onSettings: () => void; onSearch: () => void; onApp: (id: string) => void;
  onMoveApp: (id: string, target: string, after: boolean) => Promise<unknown>;
  onMoveWorkspace: (id: string, target: string, after: boolean) => Promise<unknown>;
  onContext: (input: ContextMenuRequest) => void; disabled: boolean;
}) {
  const t = useI18n();
  const drag = useRef<{
    item: DockItem; element: HTMLElement; pointerId: number; x: number; y: number; rect: DOMRect;
  } | null>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const ghostPosition = useRef({ left: 0, top: 0 });
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState<DockItem | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [fixedCollapsed, setFixedCollapsed] = useState(false);
  const previousPositions = useRef(new Map<string, DOMRect>());
  const animations = useRef(new Map<string, Animation>());
  const previousCollapseState = useRef<string | null>(null);
  useLayoutEffect(() => {
    for (const animation of animations.current.values()) animation.cancel();
    animations.current.clear();
    const items = Array.from(document.querySelectorAll<HTMLElement>('.dock [data-dock-item]'));
    const nextPositions = new Map<string, DOMRect>();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const collapseState = `${fixedCollapsed}:${[...collapsed].sort().join(',')}`;
    const animateReorder = previousCollapseState.current === collapseState;
    previousCollapseState.current = collapseState;
    for (const item of items) {
      const key = item.dataset.dockItem;
      if (!key) continue;
      const rect = item.getBoundingClientRect();
      nextPositions.set(key, rect);
      const previous = previousPositions.current.get(key);
      if (!reducedMotion && animateReorder && previous) {
        const x = previous.left - rect.left;
        const y = previous.top - rect.top;
        if (x || y) {
          animations.current.set(key, item.animate(
            [{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }],
            { duration: 240, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
          ));
        }
      }
    }
    previousPositions.current = nextPositions;
  });
  const vertical = preferences.dock === 'left' || preferences.dock === 'right';
  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick.current = false;
    if (disabled || event.pointerType === 'touch' || !(event.target instanceof Element)) return;
    const element = event.target.closest<HTMLElement>('[data-dock-item]');
    if (!element) return;
    drag.current = {
      item: dockItem(element), element, pointerId: event.pointerId,
      x: event.clientX, y: event.clientY, rect: element.getBoundingClientRect(),
    };
  }

  function findDrop(event: PointerEvent<HTMLDivElement>): DropTarget | null {
    const source = drag.current;
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-dock-item]');
    if (!source || !element || !event.currentTarget.contains(element) || element === source.element) return null;
    const item = dockItem(element);
    if (item.kind !== source.item.kind) return null;
    if (item.kind === 'app' && element.closest('.workspace-card') !== source.element.closest('.workspace-card')) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    const after = vertical ? event.clientY > rect.top + rect.height / 2 : event.clientX > rect.left + rect.width / 2;
    return { ...item, after };
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const source = drag.current;
    if (!source || source.pointerId !== event.pointerId || disabled) return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      if (Math.hypot(event.clientX - source.x, event.clientY - source.y) < 5) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      suppressClick.current = true;
      setDragging(source.item);
    }
    const left = source.rect.left + (vertical ? 0 : event.clientX - source.x);
    const top = source.rect.top + (vertical ? event.clientY - source.y : 0);
    ghostPosition.current = { left, top };
    if (ghost.current) {
      ghost.current.style.left = `${left}px`;
      ghost.current.style.top = `${top}px`;
    }
    const next = findDrop(event);
    setDrop(previous => previous?.id === next?.id && previous?.after === next?.after ? previous : next);
  }

  function finishDrag() {
    drag.current = null;
    setDragging(null);
    setDrop(null);
  }

  function releaseDrag(event: PointerEvent<HTMLDivElement>) {
    const source = drag.current;
    if (!source || source.pointerId !== event.pointerId) return;
    const target = !disabled && event.currentTarget.hasPointerCapture(event.pointerId) ? findDrop(event) : null;
    finishDrag();
    if (!target) return;
    const move = source.item.kind === 'app' ? onMoveApp : onMoveWorkspace;
    void move(source.item.id, target.id, target.after);
  }

  function dockKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const vertical = preferences.dock === 'left' || preferences.dock === 'right';
    const previous = vertical ? 'ArrowUp' : 'ArrowLeft';
    const next = vertical ? 'ArrowDown' : 'ArrowRight';
    if (![previous, next, 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(
      event.currentTarget.closest('[role="toolbar"]')!.querySelectorAll<HTMLButtonElement>('button'),
    );
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    buttons[
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (index + (event.key === next ? 1 : -1) + buttons.length) % buttons.length
    ]?.focus();
  }

  const cardIds = orderedCards(data, preferences);
  const tooltip = (text: string) => dragging ? {} : { 'data-tooltip': text, 'data-tooltip-placement': 'dock' };
  const draggedApp = dragging?.kind === 'app' ? data.apps.find(app => app.id === dragging.id) : undefined;
  const draggedWorkspace = dragging?.kind === 'workspace'
    ? data.workspaces.findIndex(workspace => workspace.id === dragging.id)
    : -1;
  return <div className="dock" role="toolbar" aria-label={t('Services')}
    tabIndex={-1}
    aria-orientation={preferences.dock === 'left' || preferences.dock === 'right' ? 'vertical' : 'horizontal'}
    onPointerDown={startDrag}
    onPointerMove={moveDrag}
    onPointerUp={releaseDrag}
    onPointerCancel={finishDrag}
    onPointerLeave={event => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) finishDrag();
    }}
    onLostPointerCapture={finishDrag}
    onKeyDownCapture={event => {
      const pointerId = drag.current?.pointerId;
      if (event.key !== 'Escape' || pointerId === undefined ||
          !event.currentTarget.hasPointerCapture(pointerId)) return;
      event.preventDefault();
      event.stopPropagation();
      finishDrag();
      event.currentTarget.releasePointerCapture(pointerId);
    }}
    onDragStart={event => event.preventDefault()}
    onClickCapture={event => {
      if (!suppressClick.current || event.detail === 0) return;
      suppressClick.current = false;
      event.stopPropagation();
    }}>
    <div className="dock-brand" {...tooltip('Rokko')}>
      <img className="dock-logo" src={logo} alt="Rokko"/>
    </div>
    <div className="dock-groups">{cardIds.filter(id => !preferences.hiddenWorkspaces.includes(id)).map(id => {
    const workspace = data.workspaces.find(w => w.id === id);
    const apps = data.apps.filter(a => a.workspaceId === (id === 'global' ? null : id));
    if (id === 'global' && !apps.length) return null;
    const isCollapsed = collapsed.has(id);
    const workspaceName = workspace?.name ?? t('Always visible');
    return <div className={`dock-card workspace-card ${isCollapsed ? 'is-collapsed' : ''}`}
      role="group" aria-label={workspaceName} key={id}>
      <button data-dock-item={`workspace:${id}`} className={`workspace-trigger ${dragging?.kind === 'workspace' && dragging.id === id ? 'drag-ghost' : ''}`} onKeyDown={event => {
        dockKey(event);
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
         event.preventDefault(); onContext({ kind: workspace ? 'workspace' : 'global', id });
        }
      }} onContextMenu={event => {
        event.preventDefault();
        onContext({ kind: workspace ? 'workspace' : 'global', id });
      }} aria-expanded={!isCollapsed} aria-label={t(isCollapsed ? 'Expand {name}' : 'Collapse {name}', { name: workspaceName })}
        onFocus={event => event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}
        {...tooltip(workspaceName)}
        data-drop={drop?.kind === 'workspace' && drop.id === id ? (drop.after ? 'after' : 'before') : undefined}
        onClick={() => setCollapsed(previous => {
         const next = new Set(previous);
         if (next.has(id)) next.delete(id); else next.add(id);
         return next;
        })}>
        <WorkspaceMark name={workspace?.name ?? null} index={data.workspaces.findIndex(w => w.id === id)}/>
       </button>
      <div
        className="dock-services"
        inert={isCollapsed}
        style={{ '--dock-expanded-size': `${42 * apps.length}px` } as React.CSSProperties}
      >
      <div className="dock-services-inner">
        {apps.map((service) => {
          const state = lifecycle.suspendedIds?.includes(service.id)
            ? 'suspended'
            : lifecycle.appStates?.[service.id]?.status === 'failed'
              ? 'failed'
              : lifecycle.loadedIds?.includes(service.id)
                ? 'running'
                : 'not-loaded';
          const notificationCount = lifecycle.notificationCounts?.[service.id] ?? 0;
          return (
            <button
              key={service.id}
              data-app-id={service.id}
              data-dock-item={`app:${service.id}`}
              className={`dock-btn ${service.id === activeId && page === 'home' ? 'selected' : ''} ${dragging?.kind === 'app' && dragging.id === service.id ? 'drag-ghost' : ''}`}
              data-service-status={state}
              aria-label={notificationCount > 0
                ? t('{name}, {count} notifications', { name: service.name, count: notificationCount })
                : service.name}
              {...tooltip(service.name)}
              data-drop={drop?.kind === 'app' && drop.id === service.id ? (drop.after ? 'after' : 'before') : undefined}
              aria-current={service.id === activeId && page === 'home' ? 'page' : undefined}
              onFocus={(event) => {
                event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              }}
              onKeyDown={(event) => {
                dockKey(event);
                if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                  event.preventDefault();
                  onContext({ kind: 'service', id: service.id });
                }
              }}
              onClick={() => onApp(service.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                onContext({ kind: 'service', id: service.id });
              }}
            >
              <ServiceIcon name={service.name} url={service.url} icon={service.icon} />
              {notificationCount > 0 && (
                <span className="notification-badge" aria-hidden="true">
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              )}
              {(state === 'suspended' || state === 'failed') && (
                <span className={`service-status status-${state}`} aria-hidden="true">
                  {state === 'suspended' ? <Icon name="pause" size={8} /> : '!'}
                </span>
              )}
            </button>
          );
        })}
      </div>
       </div>
    </div>;
  })}</div>
  <div className={`dock-card fixed-card ${fixedCollapsed ? 'is-collapsed' : ''}`}>
    <button className="fixed-collapse-toggle" aria-expanded={!fixedCollapsed}
      aria-controls="dock-actions"
      aria-label={t('Quick actions')}
      {...tooltip(t('Quick actions'))}
      onClick={() => setFixedCollapsed(value => !value)}>
      <Icon name="sliders" size={20}/>
    </button>
    <div
      className="dock-actions"
      id="dock-actions"
      inert={fixedCollapsed}
      style={{ '--dock-expanded-size': `${42 * 3}px` } as React.CSSProperties}
    >
      <button className={`dock-btn ${page === 'dashboard' ? 'selected' : ''}`} {...tooltip(t('Home'))} aria-label={t('Home')} aria-current={page === 'dashboard' ? 'page' : undefined} onKeyDown={dockKey} onClick={onHome}><Icon name="home"/></button>
      <button className={`dock-btn ${page === 'settings' ? 'selected' : ''}`} {...tooltip(t('Settings'))} aria-label={t('Settings')} aria-current={page === 'settings' ? 'page' : undefined} onKeyDown={dockKey} onClick={onSettings}><Icon name="settings"/></button>
      <button className="dock-btn" {...tooltip(t('Quick switch'))} aria-label={t('Quick switch')} onKeyDown={dockKey} onClick={onSearch}><Icon name="search"/></button>
    </div>
  </div>
  {dragging && (draggedApp || dragging.kind === 'workspace') && createPortal(
    <div
      ref={element => {
        ghost.current = element;
        if (element) {
          element.style.left = `${ghostPosition.current.left}px`;
          element.style.top = `${ghostPosition.current.top}px`;
        }
      }}
      className={`dock-drag-preview ${draggedApp ? 'dock-btn' : 'workspace-trigger'}`}
      aria-hidden="true"
    >
      {draggedApp
        ? <ServiceIcon name={draggedApp.name} url={draggedApp.url} icon={draggedApp.icon} />
        : <WorkspaceMark name={data.workspaces[draggedWorkspace]?.name ?? null} index={draggedWorkspace} />}
    </div>,
    document.body,
  )}
  </div>;
}
