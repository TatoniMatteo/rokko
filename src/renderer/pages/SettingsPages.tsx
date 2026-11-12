import { useEffect, useRef, useState } from 'react';
import type { AppData, AppInput, WebApp, Workspace } from '../../shared/contracts/model';
import { serviceCatalog, type ServiceTemplate } from '../../shared/services/service-catalog.mjs';
import { sharesWorkspace } from '../../shared/apps/sessions.mjs';
import { notificationOrigin } from '../../shared/notifications/notifications.mjs';
import { ServiceIcon, readCustomIcon } from '../components/ServiceIcon';

export function CatalogPage({ onChoose }: { onChoose: (template?: ServiceTemplate) => void }) {
  const [query, setQuery] = useState('');
  const services = serviceCatalog.templates.filter(service => service.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="settings-page"><div className="page-heading"><div><span className="page-eyebrow">YOUR SERVICES</span>
    <h1>Add an application</h1><p>Choose a service or connect your own website.</p></div></div>
    <label className="field-label" htmlFor="catalog-search">Search services</label>
    <input className="page-input catalog-search" id="catalog-search" type="search" value={query}
      onChange={event => setQuery(event.target.value)} placeholder="Find a service…" autoFocus/>
    <div className="service-grid">{services.map(service => <button className="service-card" key={service.id}
      onClick={() => onChoose(service)}><ServiceIcon name={service.name} url={service.url}/>
      <strong>{service.name}</strong><span>{new URL(service.url).hostname}</span></button>)}
      <button className="service-card custom-service" onClick={() => onChoose()}><span className="service-icon">+</span>
        <strong>Custom service</strong><span>Connect any HTTPS website</span></button>
    </div>{!services.length && <p className="page-note">No matching service. You can always add a custom website.</p>}
  </div>;
}

export function AppSettingsPage({ app, draft, onDraft, workspaces, previewUrl, busy, onSave, onBack, onRemove, onError }:
  { app?: WebApp; draft: AppInput; onDraft: (value: AppInput) => void; workspaces: Workspace[]; previewUrl: string;
    busy: boolean; onSave: () => void; onBack: () => void; onRemove: () => void; onError: (message: string) => void }) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [remove, setRemove] = useState(false);
  const [readingIcon, setReadingIcon] = useState(false);
  const [testStatus, setTestStatus] = useState('');
  const origin = notificationOrigin(draft.url);
  return <div className="settings-page"><button className="text-button" onClick={onBack}>← Back</button>
    <div className="page-heading"><div><span className="page-eyebrow">APPLICATION SETTINGS</span>
      <h1>{app ? `Edit ${app.name}` : 'Set up your application'}</h1>
      <p>Give it a name, choose its workspace and make it yours.</p></div></div>
    <form className="settings-form" onSubmit={event => { event.preventDefault(); onSave(); }}>
      <section className="settings-card"><h2>Application</h2>
        <label htmlFor="app-name">Application name</label><input id="app-name" disabled={readingIcon} value={draft.name} required maxLength={48}
          onChange={event => onDraft({ ...draft, name: event.target.value })}/>
        <label htmlFor="app-url">Website URL (HTTPS)</label><input id="app-url" disabled={readingIcon} value={draft.url} required
          onChange={event => onDraft({ ...draft, url: event.target.value,
            notificationOrigin: notificationOrigin(event.target.value) === draft.notificationOrigin ? draft.notificationOrigin : null })}/>
        <label htmlFor="app-workspace">Workspace</label><select id="app-workspace" disabled={readingIcon} value={draft.workspaceId ?? "global"}
          onChange={event => onDraft({ ...draft, workspaceId: event.target.value === 'global' ? null : event.target.value,
            shareWorkspaceSession: event.target.value === 'global' ? false : draft.shareWorkspaceSession })}>
          <option value="global">Always visible · no workspace</option>
          {workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
        </select><label className="notification-toggle"><input id="app-shared-session" type="checkbox"
          checked={Boolean(draft.workspaceId !== null && draft.shareWorkspaceSession)} disabled={draft.workspaceId === null}
          onChange={event => onDraft({ ...draft, shareWorkspaceSession: event.target.checked })}/>
          <span>Use the workspace account session</span></label>
        <p className="page-note">Workspace sessions share logins between connected services. Other workspaces and global services stay separate.
          Changing session reloads this app; previous session data stays on this device and is not copied.</p></section>
      <section className="settings-card"><h2>Service icon</h2><div className="icon-preview">
        <ServiceIcon name={draft.name} url={previewUrl} icon={draft.icon}/><div><strong>{draft.icon ? 'Custom image' : 'Website favicon'}</strong>
          <p className="page-note">Automatic icons follow the saved website. Missing icons use initials.</p></div></div>
        <label htmlFor="app-icon">Choose an image</label><input id="app-icon" type="file" accept="image/png,image/jpeg,image/webp"
          disabled={readingIcon} onChange={async event => {
            const file = event.target.files?.[0];
            if (!file) return;
            setReadingIcon(true);
            try {
              const icon = await readCustomIcon(file);
              if (mounted.current) onDraft({ ...draft, icon });
            }
            catch (error) { onError(error instanceof Error ? error.message : String(error)); }
            finally { if (mounted.current) setReadingIcon(false); }
          }}/><button type="button" className="text-button" onClick={() => onDraft({ ...draft, icon: null })}>
          Use website favicon</button></section>
      <section className="settings-card"><h2>Notifications</h2>
        <label className="notification-toggle" htmlFor="app-notifications"><input id="app-notifications" type="checkbox"
          disabled={!origin} checked={Boolean(origin && draft.notificationOrigin === origin)}
          onChange={event => { setTestStatus(''); onDraft({ ...draft, notificationOrigin: event.target.checked ? origin : null }); }}/>
          <span>Allow notifications from <strong>{origin ?? 'this website'}</strong></span></label>
        <p className="page-note">Permission applies only to this app and website. Enable notifications in the service too, if it asks.
          Changing the website requires a new consent. Enabled services start with Rokko and stay connected in the background.
          Saving a permission change reloads this app without signing you out.</p>
        <button type="button" className="secondary" disabled={busy || testStatus === 'Sending…' || !app?.notificationOrigin || app.notificationOrigin !== draft.notificationOrigin}
          onClick={async () => {
            if (!app) return;
            setTestStatus('Sending…');
            try { await window.rokko.testNotification(app.id); if (mounted.current) setTestStatus('Test notification sent.'); }
            catch (error) { if (mounted.current) setTestStatus(error instanceof Error ? error.message : String(error)); }
          }}>Send test notification</button><p className="page-note" role="status">{testStatus}</p>
      </section>
      <div className="page-actions"><button className="primary" type="submit" disabled={busy || readingIcon}>
        {busy ? 'Saving…' : app ? 'Save changes' : 'Add application'}</button>
        <button className="secondary" type="button" disabled={busy} onClick={onBack}>Cancel</button></div>
    </form>
    {app && <section className="settings-card danger-zone"><h2>Remove application</h2>
      <p className="page-note">This removes the service from Rokko. Its browser session data stays on this device.</p>
      {remove ? <div className="page-actions"><button className="danger-button" disabled={busy} onClick={onRemove}>Confirm removal</button>
        <button className="secondary" onClick={() => setRemove(false)}>Keep application</button></div>
        : <button className="danger-button" onClick={() => setRemove(true)}>Remove application</button>}</section>}
  </div>;
}

export function WorkspaceSettingsPage({ workspace, data, busy, onSave, onRemove, onBack, onSession, onAccount }:
  { workspace?: Workspace; data: AppData; busy: boolean; onSave: (name: string) => void;
    onRemove: (destination: string) => void; onBack: () => void; onSession: (app: WebApp, shared: boolean) => void;
    onAccount: (provider: 'google' | 'microsoft') => void }) {
  const [name, setName] = useState(workspace?.name ?? '');
  const [destination, setDestination] = useState('');
  const count = data.apps.filter(app => app.workspaceId === workspace?.id).length;
  return <div className="settings-page"><button className="text-button" onClick={onBack}>← Back</button>
    <div className="page-heading"><div><span className="page-eyebrow">WORKSPACE SETTINGS</span>
      <h1>{workspace ? `Edit ${workspace.name}` : 'Create workspace'}</h1><p>Organize your applications by context.</p></div></div>
    <form className="settings-form" onSubmit={event => { event.preventDefault(); onSave(name); }}>
      <section className="settings-card"><label htmlFor="workspace-name">Workspace name</label>
        <input id="workspace-name" value={name} onChange={event => setName(event.target.value)} required maxLength={48} autoFocus/>
        <button className="primary" type="submit" disabled={busy}>{workspace ? 'Save workspace' : 'Create workspace'}</button></section>
    </form>{workspace && <section className="settings-card"><h2>Workspace accounts</h2>
      <p className="page-note">Sign in through the provider’s account page. Connected services use this workspace’s browser session,
        including Google sign-in where supported. Each workspace has its own session; passwords and cookies stay in Chromium.</p>
      <div className="page-actions"><button className="secondary" disabled={busy} onClick={() => onAccount('google')}>Manage Google accounts</button>
        <button className="secondary" disabled={busy} onClick={() => onAccount('microsoft')}>Manage Microsoft accounts</button></div>
      <p className="page-note">The account page opens as a service in this workspace. The provider handles account selection and sign-out.
        Changing a service’s session keeps its previous login data on this device.</p>
      {data.apps.filter(app => app.workspaceId === workspace.id).map(app => <label className="notification-toggle" key={app.id}>
        <input type="checkbox" checked={sharesWorkspace(app)} disabled={busy}
          onChange={event => onSession(app, event.target.checked)}/><span>{app.name} · {sharesWorkspace(app) ? 'Workspace session' : 'Separate session'}</span></label>)}
    </section>}{workspace && <section className="settings-card danger-zone"><h2>Remove workspace</h2>
      {data.workspaces.length <= 1 ? <p className="page-note">Keep at least one workspace. Create another before removing this one.</p>
        : <><p className="page-note">Move its {count} application(s) to another workspace. Separate sessions are preserved; shared services use the destination workspace session.</p>
          <label htmlFor="workspace-destination">Move applications to</label><select id="workspace-destination" value={destination}
            onChange={event => setDestination(event.target.value)}><option value="">Choose a destination…</option>
            {data.workspaces.filter(item => item.id !== workspace.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select><button className="danger-button" disabled={busy || !destination} onClick={() => onRemove(destination)}>
            Transfer applications and remove workspace</button></>}</section>}
  </div>;
}

export function ManagePage({ data, busy, onEditApp, onEditWorkspace, onNewWorkspace, onCatalog, onReorder }:
  { data: AppData; busy: boolean; onEditApp: (app: WebApp) => void; onEditWorkspace: (workspace: Workspace) => void;
    onNewWorkspace: () => void; onCatalog: () => void; onReorder: (id: string, direction: -1 | 1) => void }) {
  return <div className="settings-page"><div className="page-heading"><div><span className="page-eyebrow">YOUR WORKSPACE</span>
    <h1>Manage applications</h1><p>Edit, move and reorder your services.</p></div><div className="page-actions">
      <button className="secondary" onClick={onNewWorkspace}>New workspace</button><button className="primary" onClick={onCatalog}>Add application</button>
    </div></div>{data.workspaces.map(workspace => {
      const apps = data.apps.filter(app => app.workspaceId === workspace.id);
      return <section className="settings-card" key={workspace.id}><div className="section-heading"><h2>{workspace.name}</h2>
        <button className="text-button" onClick={() => onEditWorkspace(workspace)}>Edit workspace</button></div>
        {!apps.length && <p className="page-note">No applications yet.</p>}{apps.map((app, index) => <div className="managed-service" key={app.id}>
          <ServiceIcon name={app.name} url={app.url} icon={app.icon}/><div className="managed-label"><strong>{app.name}</strong><span>{app.url}</span></div>
          <div className="page-actions"><button className="secondary compact" disabled={busy || index === 0}
            aria-label={`Move ${app.name} up`} onClick={() => onReorder(app.id, -1)}>↑</button>
          <button className="secondary compact" disabled={busy || index === apps.length - 1}
            aria-label={`Move ${app.name} down`} onClick={() => onReorder(app.id, 1)}>↓</button>
          <button className="secondary" onClick={() => onEditApp(app)}>Edit</button></div></div>)}</section>;
    })}{data.apps.some(app => app.workspaceId === null) && <section className="settings-card"><h2>Always visible</h2>
      {data.apps.filter(app => app.workspaceId === null).map((app, index) => <div className="managed-service" key={app.id}>
        <ServiceIcon name={app.name} url={app.url} icon={app.icon}/><div className="managed-label"><strong>{app.name}</strong><span>{app.url}</span></div>
        <div className="page-actions"><button className="secondary compact" disabled={busy || index === 0}
          aria-label={`Move ${app.name} up`} onClick={() => onReorder(app.id, -1)}>↑</button>
          <button className="secondary compact" disabled={busy || index === data.apps.filter(item => item.workspaceId === null).length - 1}
            aria-label={`Move ${app.name} down`} onClick={() => onReorder(app.id, 1)}>↓</button>
          <button className="secondary" onClick={() => onEditApp(app)}>Edit</button></div></div>)}</section>}</div>;
}
