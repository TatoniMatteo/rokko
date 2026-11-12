import { useState } from 'react';
import type { AppData, ContextMenuRequest, WebApp, Workspace } from '../../shared/contracts/model';
import { orderedCards, type Preferences } from '../../shared/preferences/preferences.mjs';
import { Icon } from '../components/Icon';
import { ServiceIcon } from '../components/ServiceIcon';
import { SortableList } from '../components/SortableList';
import { WorkspaceMark } from '../components/Dock';
import { useI18n } from '../preferences/i18n';
import logo from '../../../assets/brand/rokko-dark-icon.png';
export function DashboardPage({ data, preferences, busy, onPreferences, onMoveApp, onEditApp, onEditWorkspace, onNewWorkspace, onCatalog, onManageServices, onManageWorkspaces, onContext }: {
  onContext: (input: ContextMenuRequest) => void; data: AppData; preferences: Preferences; busy: boolean; onPreferences: (value: Preferences) => Promise<unknown>;
  onMoveApp: (id: string, target: string, after: boolean) => Promise<unknown>; onEditApp: (app: WebApp) => void;
  onEditWorkspace: (workspace: Workspace) => void; onNewWorkspace: () => void; onCatalog: () => void; onManageServices: () => void; onManageWorkspaces: () => void;
}) {
  const t = useI18n();
  const [selected, setSelected] = useState(data.selectedWorkspaceId);
  const cards = orderedCards(data, preferences);
  const selectedId = cards.includes(selected) ? selected : 'global';
  const apps = data.apps.filter(a => a.workspaceId === (selectedId === 'global' ? null : selectedId));
  const cardName = (id: string) => data.workspaces.find(w => w.id === id)?.name ?? t('Always visible');
  return <div className="settings-page dashboard welcome"><div className="page-heading"><div className="dashboard-heading-copy">
    <h1>{t('Your space, your way.')}</h1><p>{t('All your services. Just the workspaces you need.')}</p></div><span className="dashboard-brand"><img className="dashboard-logo" src={logo} alt="Rokko"/></span></div>
    <div className="page-actions dashboard-actions"><button className="primary" onClick={onCatalog}><Icon name="plus"/>{t('Add application')}</button>
      <button className="secondary" onClick={onNewWorkspace}>{t('New workspace')}</button><button className="secondary" onClick={onManageServices}>{t('Configured services')}</button>
      <button className="secondary" onClick={onManageWorkspaces}>{t('All workspaces')}</button></div>
    <div className="dashboard-grid"><section className="settings-card"><h2>{t('Dock cards')}</h2>
      <p className="page-note">{t('Home and Settings are always available. Hidden workspaces keep running.')}</p>
      <SortableList ids={cards} onContext={id => onContext({ kind: id === 'global' ? 'global' : 'workspace', id })} label={cardName} disabled={busy} onMove={async (id, target, after) => {
        const order = cards.filter(v => v !== id); order.splice(order.indexOf(target) + (after ? 1 : 0), 0, id);
        return onPreferences({ ...preferences, cardOrder: order });
      }} render={id => { const workspace = data.workspaces.find(w => w.id === id);
        const count = data.apps.filter(a => a.workspaceId === (id === 'global' ? null : id)).length; return <>
        <WorkspaceMark name={workspace?.name ?? null} index={data.workspaces.findIndex(w => w.id === id)}/>
        <button className="row-label" onClick={() => setSelected(id)} aria-pressed={id === selectedId}>{cardName(id)}
          <small>{t(count === 1 ? '{count} service' : '{count} services', { count })}</small></button>
        {workspace && <><input type="checkbox" role="switch" checked={!preferences.hiddenWorkspaces.includes(id)} disabled={busy}
          aria-label={t('Show {name} in dock', { name: workspace.name })} onChange={e => void onPreferences({ ...preferences,
            hiddenWorkspaces: e.target.checked ? preferences.hiddenWorkspaces.filter(v => v !== id) : [...preferences.hiddenWorkspaces, id] })}/>
          <button className="icon-btn" aria-label={t('Edit workspace {name}', { name: workspace.name })} onClick={() => onEditWorkspace(workspace)}><Icon name="more"/></button></>}
      </>; }}/>
    </section><section className="settings-card"><h2>{t('Services')}</h2><label htmlFor="dashboard-workspace">{t('Workspace')}</label>
      <select id="dashboard-workspace" value={selectedId} onChange={e => setSelected(e.target.value)}>
        {cards.map(id => <option key={id} value={id}>{cardName(id)}</option>)}</select>
      {!apps.length && <p>{t('No applications yet.')}</p>}
      <SortableList ids={apps.map(a => a.id)} onContext={id => onContext({ kind: 'service', id })} label={id => apps.find(a => a.id === id)!.name} disabled={busy} onMove={onMoveApp} render={id => { const service = apps.find(a => a.id === id)!; return <>
        <ServiceIcon name={service.name} url={service.url} icon={service.icon}/><span className="row-label">{service.name}</span>
        <button className="icon-btn" aria-label={t('Edit {name}', { name: service.name })} onClick={() => onEditApp(service)}><Icon name="more"/></button>
      </>; }}/>
    </section></div>
  </div>;
}
