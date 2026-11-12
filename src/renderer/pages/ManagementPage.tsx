import { useState } from 'react';
import type { AppData, ContextMenuRequest, WebApp, Workspace } from '../../shared/contracts/model';
import type { Preferences } from '../../shared/preferences/preferences.mjs';
import { Icon } from '../components/Icon';
import { ServiceIcon } from '../components/ServiceIcon';
import { WorkspaceMark } from '../components/Dock';
import { useI18n } from '../preferences/i18n';

export function ManagementPage({ mode, data, preferences, initialWorkspace, busy, onOpen, onEditApp,
  onEditWorkspace, onVisibility, onCatalog, onNewWorkspace, onContext }: {
  onContext: (input: ContextMenuRequest) => void; mode: 'services' | 'workspaces'; data: AppData; preferences: Preferences; initialWorkspace?: string;
  busy: boolean; onOpen: (app: WebApp) => void; onEditApp: (app: WebApp) => void;
  onEditWorkspace: (workspace: Workspace) => void; onVisibility: (workspace: Workspace) => void;
  onCatalog: () => void; onNewWorkspace: () => void;
}) {
  const t = useI18n();
  const [query, setQuery] = useState('');
  const [workspace, setWorkspace] = useState(initialWorkspace ?? 'all');
  const matches = (name: string) => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const workspaceName = (id: string | null) => data.workspaces.find(w => w.id === id)?.name ?? t('Always visible');
  const services = data.apps.filter(a => (workspace === 'all' || a.workspaceId === (workspace === 'global' ? null : workspace)) &&
    matches(a.name + ' ' + a.url + ' ' + workspaceName(a.workspaceId)));
  const workspaces = data.workspaces.filter(w => matches(w.name));
  return <div className="settings-page management-page"><div className="page-heading"><div>
    <h1>{t(mode === 'services' ? 'Configured services' : 'All workspaces')}</h1>
    <p>{t(mode === 'services' ? 'Manage every service, including hidden workspaces and global apps.' : 'Manage workspace names, accounts and visibility in one place.')}</p>
  </div></div><div className="page-actions dashboard-actions">
    <button className="primary" onClick={mode === 'services' ? onCatalog : onNewWorkspace}><Icon name="plus"/>
      {t(mode === 'services' ? 'Add application' : 'New workspace')}</button></div>
    <section className="settings-card"><div className="management-filters"><div>
      <label htmlFor="management-search">{t('Search')}</label><input id="management-search" type="search" value={query}
        onChange={e => setQuery(e.target.value)} placeholder={t('Search by name…')}/></div>
      {mode === 'services' && <div><label htmlFor="management-workspace">{t('Workspace')}</label>
        <select id="management-workspace" value={workspace} onChange={e => setWorkspace(e.target.value)}>
          <option value="all">{t('All workspaces')}</option><option value="global">{t('Always visible')}</option>
          {data.workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select></div>}</div>
      <div className="management-list">{mode === 'services' ? services.map(a => <div className="management-row" key={a.id} data-service-id={a.id}
        onContextMenu={event => { event.preventDefault(); onContext({ kind: 'service', id: a.id }); }}>
        <ServiceIcon name={a.name} url={a.url} icon={a.icon}/><div className="row-label"><strong>{a.name}</strong>
          <small>{workspaceName(a.workspaceId)} · {new URL(a.url).hostname}</small></div>
        <button className="secondary compact" disabled={busy} aria-label={t('Open {name}', { name: a.name })} onClick={() => onOpen(a)}>{t('Open')}</button>
        <button className="icon-btn" disabled={busy} aria-label={t('Edit {name}', { name: a.name })} onClick={() => onEditApp(a)}><Icon name="more"/></button>
      </div>) : workspaces.map(w => <div className="management-row" key={w.id} data-workspace-id={w.id}
        onContextMenu={event => { event.preventDefault(); onContext({ kind: 'workspace', id: w.id }); }}>
        <WorkspaceMark name={w.name} index={data.workspaces.indexOf(w)}/><div className="row-label"><strong>{w.name}</strong>
          <small>{t(data.apps.filter(a => a.workspaceId === w.id).length === 1 ? '{count} service' : '{count} services',
            { count: data.apps.filter(a => a.workspaceId === w.id).length })}</small></div>
        <label className="visibility-control"><span className="sr-only">{t('Show {name} in dock', { name: w.name })}</span>
          <input type="checkbox" role="switch" checked={!preferences.hiddenWorkspaces.includes(w.id)} disabled={busy}
            onChange={() => onVisibility(w)}/></label>
        <button className="icon-btn" disabled={busy} aria-label={t('Edit workspace {name}', { name: w.name })} onClick={() => onEditWorkspace(w)}><Icon name="more"/></button>
      </div>)}</div>
      {!(mode === 'services' ? services : workspaces).length && <p className="page-note">{t('No results.')}</p>}
    </section></div>;
}
