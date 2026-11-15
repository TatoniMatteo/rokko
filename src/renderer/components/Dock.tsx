import type { KeyboardEvent } from 'react';
import type { AppData, ContextMenuRequest } from '../../shared/contracts/model';
import type { Preferences } from '../../shared/preferences/preferences.mjs';
import { orderedCards } from '../../shared/preferences/preferences.mjs';
import { Icon } from './Icon';
import { ServiceIcon } from './ServiceIcon';
import logo from '../../../assets/brand/rokko-dark-icon.png';
import { useI18n } from '../preferences/i18n';
export function WorkspaceMark({ name, index = 0 }: { name: string | null; index?: number }) {
  return <span className="workspace-mark" title={name ?? undefined}
    style={{ '--workspace-hue': (index * 67 + 180) % 360 } as React.CSSProperties} aria-hidden="true">
    {name ? Array.from(name.trim())[0]?.toLocaleUpperCase() : <Icon name="globe" size={14}/>}</span>;
}
export function Dock({ data, preferences, activeId, page, onHome, onSettings, onSearch, onApp, onContext }: {
  data: AppData; preferences: Preferences; activeId: string | null; page: string;
  onHome: () => void; onSettings: () => void; onSearch: () => void; onApp: (id: string) => void; onContext: (input: ContextMenuRequest) => void;
}) {
  const t = useI18n();
  function dockKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const vertical = preferences.dock === 'left' || preferences.dock === 'right';
    const previous = vertical ? 'ArrowUp' : 'ArrowLeft';
    const next = vertical ? 'ArrowDown' : 'ArrowRight';
    if (![previous, next, 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(
      event.currentTarget.closest('nav')!.querySelectorAll<HTMLButtonElement>('button'),
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

  return <nav className="dock" aria-label={t('Services')}><div className="dock-card fixed-card"><img className="dock-logo" src={logo} alt="Rokko"/>
    <button className={`dock-btn ${page === 'dashboard' ? 'selected' : ''}`} title={t('Home')} aria-label={t('Home')} aria-current={page === 'dashboard' ? 'page' : undefined} onKeyDown={dockKey} onClick={onHome}><Icon name="home"/></button>
    <button className={`dock-btn ${page === 'settings' ? 'selected' : ''}`} title={t('Settings')} aria-label={t('Settings')} aria-current={page === 'settings' ? 'page' : undefined} onKeyDown={dockKey} onClick={onSettings}><Icon name="settings"/></button>
    <button className="dock-btn" title={t('Quick switch')} aria-label={t('Quick switch')} onKeyDown={dockKey} onClick={onSearch}><Icon name="search"/></button>
  </div><div className="dock-groups">{orderedCards(data, preferences).filter(id => !preferences.hiddenWorkspaces.includes(id)).map(id => {
    const workspace = data.workspaces.find(w => w.id === id);
    const apps = data.apps.filter(a => a.workspaceId === (id === 'global' ? null : id));
    if (id === 'global' && !apps.length) return null;
    return <div className="dock-card" role="group" aria-label={workspace?.name ?? t('Always visible')} key={id}>
      <button className="workspace-trigger" onKeyDown={dockKey} aria-haspopup="menu" aria-label={workspace?.name ?? t('Always visible')}
        onFocus={event => event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}
        title={workspace?.name ?? t('Always visible')} onClick={() => onContext({ kind: workspace ? 'workspace' : 'global', id })}
        onContextMenu={event => { event.preventDefault(); onContext({ kind: workspace ? 'workspace' : 'global', id }); }}>
        <WorkspaceMark name={workspace?.name ?? null} index={data.workspaces.findIndex(w => w.id === id)}/></button>
      {apps.map(service => <button key={service.id} data-app-id={service.id}
        className={`dock-btn ${service.id === activeId && page === 'home' ? 'selected' : ''}`}
        title={service.name} aria-label={service.name} aria-current={service.id === activeId && page === 'home' ? 'page' : undefined}
        onKeyDown={event => {
          dockKey(event);
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault(); onContext({ kind: 'service', id: service.id });
          }
        }} onClick={() => onApp(service.id)} onContextMenu={event => { event.preventDefault(); onContext({ kind: 'service', id: service.id }); }}
        onFocus={event => event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}>
        <ServiceIcon name={service.name} url={service.url} icon={service.icon}/></button>)}
    </div>;
  })}</div></nav>;
}
