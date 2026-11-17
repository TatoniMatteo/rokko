import { useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { AppData, AppSnapshot, ContextMenuRequest } from '../../shared/contracts/model';
import type { Preferences } from '../../shared/preferences/preferences.mjs';
import { orderedCards } from '../../shared/preferences/preferences.mjs';
import { Icon } from './Icon';
import { ServiceIcon } from './ServiceIcon';
import logo from '../../../assets/brand/rokko-dark-icon.png';
import { useI18n } from '../preferences/i18n';
function reorderedIds(ids: string[], source: string, target: string, after: boolean) {
  const result = ids.filter(id => id !== source);
  const targetIndex = result.indexOf(target);
  if (targetIndex < 0) return ids;
  result.splice(targetIndex + (after ? 1 : 0), 0, source);
  return result;
}
export function WorkspaceMark({ name, index = 0 }: { name: string | null; index?: number }) {
  return <span className="workspace-mark"
    style={{ '--workspace-hue': (index * 67 + 180) % 360 } as React.CSSProperties} aria-hidden="true">
    {name ? Array.from(name.trim())[0]?.toLocaleUpperCase() : <Icon name="globe" size={14}/>}</span>;
}
export function Dock({ data, lifecycle, preferences, activeId, page, onHome, onSettings, onSearch, onApp, onMoveApp, onMoveWorkspace, onContext, disabled }: {
  data: AppData; lifecycle: AppSnapshot; preferences: Preferences; activeId: string | null; page: string;
  onHome: () => void; onSettings: () => void; onSearch: () => void; onApp: (id: string) => void;
  onMoveApp: (id: string, target: string, after: boolean) => Promise<unknown>;
  onMoveWorkspace: (id: string, target: string, after: boolean) => Promise<unknown>;
  onContext: (input: ContextMenuRequest) => void; disabled: boolean;
}) {
  const t = useI18n();
  const drag = useRef<{ kind: 'app' | 'workspace'; id: string } | null>(null);
  const [dragging, setDragging] = useState<{ kind: 'app' | 'workspace'; id: string } | null>(null);
  const [drop, setDrop] = useState<{ kind: 'app' | 'workspace'; id: string; after: boolean } | null>(null);
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
  const positionAfter = (event: DragEvent<HTMLElement>, id: string, kind: 'app' | 'workspace') => {
    const rect = event.currentTarget.getBoundingClientRect();
    const position = vertical ? event.clientY - rect.top : event.clientX - rect.left;
    const length = vertical ? rect.height : rect.width;
    const middle = length / 2;
    const tolerance = length * 0.18;
    if (
      drop?.kind === kind &&
      drop.id === id &&
      position >= middle - tolerance &&
      position <= middle + tolerance
    )
      return drop.after;
    if (position < middle - tolerance) return false;
    if (position > middle + tolerance) return true;
    return position > middle;
  };
  function startDrag(event: DragEvent<HTMLElement>, item: { kind: 'app' | 'workspace'; id: string }) {
    if (disabled) { event.preventDefault(); return; }
    drag.current = item;
    setDragging(item);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${item.kind}:${item.id}`);
  }
  function finishDrag() {
    drag.current = null;
    setDragging(null);
    setDrop(null);
  }
  function dragOver(event: DragEvent<HTMLElement>, id: string, kind: 'app' | 'workspace') {
    const source = drag.current;
    if (!source || disabled) return;
    if (source.kind !== kind) {
      event.dataTransfer.dropEffect = 'none';
      setDrop(null);
      return;
    }
    if (source.id === id) {
      event.dataTransfer.dropEffect = 'none';
      return;
    }
    if (kind === 'app') {
      const sourceApp = data.apps.find(app => app.id === source.id);
      const targetApp = data.apps.find(app => app.id === id);
      if (!sourceApp || !targetApp || sourceApp.workspaceId !== targetApp.workspaceId) {
        event.dataTransfer.dropEffect = 'none';
        setDrop(null);
        return;
      }
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const next = { kind, id, after: positionAfter(event, id, kind) };
    setDrop(previous =>
      previous?.kind === next.kind && previous.id === next.id && previous.after === next.after
        ? previous
        : next,
    );
  }
  function dropOnApp(event: DragEvent<HTMLButtonElement>, id: string) {
    const source = drag.current;
    if (!source || disabled) return;
    event.preventDefault();
    event.stopPropagation();
    if (source.kind !== 'app') {
      finishDrag();
      return;
    }
    const sourceApp = data.apps.find(app => app.id === source.id);
    const targetApp = data.apps.find(app => app.id === id);
    if (!sourceApp || !targetApp || sourceApp.workspaceId !== targetApp.workspaceId) {
      finishDrag();
      return;
    }
    const after = positionAfter(event, id, 'app');
    finishDrag();
    if (source.id !== id) void onMoveApp(source.id, id, after);
  }
  function dropOnWorkspace(event: DragEvent<HTMLButtonElement>, id: string) {
    const source = drag.current;
    if (!source || disabled) return;
    if (source.kind !== 'workspace') {
      event.preventDefault();
      finishDrag();
      return;
    }
    event.preventDefault();
    const after = positionAfter(event, id, 'workspace');
    finishDrag();
    if (source.id !== id) void onMoveWorkspace(source.id, id, after);
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

  const allCardIds = orderedCards(data, preferences);
  const cardIds = drop?.kind === 'workspace' && dragging?.kind === 'workspace'
    ? reorderedIds(allCardIds, dragging.id, drop.id, drop.after)
    : allCardIds;
  return <div className="dock" role="toolbar" aria-label={t('Services')}
    tabIndex={-1}
    aria-orientation={preferences.dock === 'left' || preferences.dock === 'right' ? 'vertical' : 'horizontal'}
    onDragLeave={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrop(null);
    }}>
    <div className="dock-brand" data-tooltip="Rokko" data-tooltip-placement="dock">
      <img className="dock-logo" src={logo} alt="Rokko"/>
    </div>
    <div className="dock-groups">{cardIds.filter(id => !preferences.hiddenWorkspaces.includes(id)).map(id => {
    const workspace = data.workspaces.find(w => w.id === id);
    const apps = data.apps.filter(a => a.workspaceId === (id === 'global' ? null : id));
    if (id === 'global' && !apps.length) return null;
    const isCollapsed = collapsed.has(id);
    const workspaceName = workspace?.name ?? t('Always visible');
    const appIds = drop?.kind === 'app' && dragging?.kind === 'app' &&
      data.apps.find(app => app.id === dragging.id)?.workspaceId === (id === 'global' ? null : id)
      ? reorderedIds(apps.map(app => app.id), dragging.id, drop.id, drop.after)
      : apps.map(app => app.id);
    const services = appIds.map(appId => apps.find(app => app.id === appId)!);
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
        draggable={!disabled} onDragStart={event => startDrag(event, { kind: 'workspace', id })}
        onDragEnd={finishDrag}
        onDragOver={event => dragOver(event, id, 'workspace')}
        onDrop={event => dropOnWorkspace(event, id)}
        onFocus={event => event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}
        data-tooltip={workspaceName}
        data-tooltip-placement="dock"
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
        style={{ '--dock-expanded-size': `${42 * services.length}px` } as React.CSSProperties}
      >
      <div className="dock-services-inner">
        {services.map((service) => {
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
              data-tooltip-placement="dock"
              aria-current={service.id === activeId && page === 'home' ? 'page' : undefined}
              draggable={!disabled}
              onFocus={(event) => {
                event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              }}
              data-tooltip={service.name}
              onDragStart={(event) => {
                event.stopPropagation();
                startDrag(event, { kind: 'app', id: service.id });
              }}
              onDragEnd={finishDrag}
              onDragOver={(event) => dragOver(event, service.id, 'app')}
              onDrop={(event) => dropOnApp(event, service.id)}
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
      data-tooltip={t('Quick actions')}
      data-tooltip-placement="dock"
      onClick={() => setFixedCollapsed(value => !value)}>
      <Icon name="sliders" size={20}/>
    </button>
    <div
      className="dock-actions"
      id="dock-actions"
      inert={fixedCollapsed}
      style={{ '--dock-expanded-size': `${42 * 3}px` } as React.CSSProperties}
    >
      <button className={`dock-btn ${page === 'dashboard' ? 'selected' : ''}`} data-tooltip={t('Home')} data-tooltip-placement="dock" aria-label={t('Home')} aria-current={page === 'dashboard' ? 'page' : undefined} onKeyDown={dockKey} onClick={onHome}><Icon name="home"/></button>
      <button className={`dock-btn ${page === 'settings' ? 'selected' : ''}`} data-tooltip={t('Settings')} data-tooltip-placement="dock" aria-label={t('Settings')} aria-current={page === 'settings' ? 'page' : undefined} onKeyDown={dockKey} onClick={onSettings}><Icon name="settings"/></button>
      <button className="dock-btn" data-tooltip={t('Quick switch')} data-tooltip-placement="dock" aria-label={t('Quick switch')} onKeyDown={dockKey} onClick={onSearch}><Icon name="search"/></button>
    </div>
  </div></div>;
}
