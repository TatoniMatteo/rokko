import { useI18n, errorMessage } from '../preferences/i18n';
import { useEffect, useRef, useState } from 'react';
import type { AppData, AppInput, WebApp, Workspace } from '../../shared/contracts/model';
import { serviceCatalog, type ServiceTemplate } from '../../shared/services/service-catalog.mjs';
import { sharesWorkspace } from '../../shared/apps/sessions.mjs';
import { notificationOrigin } from '../../shared/notifications/notifications.mjs';
import { ServiceIcon, readCustomIcon } from '../components/ServiceIcon';

export function CatalogPage({ onChoose }: { onChoose: (template?: ServiceTemplate) => void }) {
  const t = useI18n();
  const [query, setQuery] = useState('');
  const services = serviceCatalog.templates.filter(service => service.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="settings-page"><div className="page-heading"><div>
    <h1>{t("Add an application")}</h1><p>{t("Choose a service or connect your own website.")}</p></div></div>
    <label className="field-label" htmlFor="catalog-search">{t("Search services")}</label>
    <input className="page-input catalog-search" id="catalog-search" type="search" value={query}
      onChange={event => setQuery(event.target.value)} placeholder={t("Find a service…")} autoFocus/>
    <div className="service-grid">{services.map(service => <button className="service-card" key={service.id}
      onClick={() => onChoose(service)}><ServiceIcon name={service.name} url={service.url}/>
      <strong>{service.name}</strong><span>{new URL(service.url).hostname}</span></button>)}
      <button className="service-card custom-service" onClick={() => onChoose()}><span className="service-icon">+</span>
        <strong>{t("Custom service")}</strong><span>{t("Connect any HTTPS website")}</span></button>
    </div>{!services.length && <p className="page-note">{t("No matching service. You can always add a custom website.")}</p>}
  </div>;
}

export function AppSettingsPage({ app, draft, onDraft, workspaces, previewUrl, busy, onSave, onBack, onRemove, onError }:
  { app?: WebApp; draft: AppInput; onDraft: (value: AppInput) => void; workspaces: Workspace[]; previewUrl: string;
    busy: boolean; onSave: () => void; onBack: () => void; onRemove: () => void; onError: (message: string) => void }) {
  const t = useI18n();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [remove, setRemove] = useState(false);
  const [readingIcon, setReadingIcon] = useState(false);
  const [testStatus, setTestStatus] = useState('');
  const origin = notificationOrigin(draft.url);
  return <div className="settings-page">
    <div className="page-heading"><div>
      <h1>{app ? t('Edit {name}', { name: app.name }) : t("Set up your application")}</h1>
      <p>{t("Give it a name, choose its workspace and make it yours.")}</p></div></div>
    <form className="settings-form settings-grid" onSubmit={event => { event.preventDefault(); onSave(); }}>
      <section className="settings-card"><h2>{t("Application")}</h2>
        <label htmlFor="app-name">{t("Application name")}</label><input id="app-name" disabled={readingIcon} value={draft.name} required maxLength={48}
          onChange={event => onDraft({ ...draft, name: event.target.value })}/>
        <label htmlFor="app-url">{t("Website URL (HTTPS)")}</label><input id="app-url" disabled={readingIcon} value={draft.url} required
          onChange={event => onDraft({ ...draft, url: event.target.value,
            notificationOrigin: notificationOrigin(event.target.value) === draft.notificationOrigin ? draft.notificationOrigin : null })}/>
        <label htmlFor="app-workspace">{t("Workspace")}</label><select id="app-workspace" disabled={readingIcon} value={draft.workspaceId ?? "global"}
          onChange={event => onDraft({ ...draft, workspaceId: event.target.value === 'global' ? null : event.target.value,
            shareWorkspaceSession: event.target.value === 'global' ? false : draft.shareWorkspaceSession })}>
          <option value="global">{t("Always visible · no workspace")}</option>
          {workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
        </select><label className="notification-toggle"><input id="app-shared-session" type="checkbox"
          checked={Boolean(draft.workspaceId !== null && draft.shareWorkspaceSession)} disabled={draft.workspaceId === null}
          onChange={event => onDraft({ ...draft, shareWorkspaceSession: event.target.checked })}/>
          <span>{t("Use the workspace account session")}</span></label>
        <p className="page-note">{t("Workspace sessions share logins between connected services. Other workspaces and global services stay separate. Changing session reloads this app; previous session data stays on this device and is not copied.")}</p></section>
      <section className="settings-card"><h2>{t("Service icon")}</h2><div className="icon-preview">
        <ServiceIcon name={draft.name} url={previewUrl} icon={draft.icon}/><div><strong>{draft.icon ? t("Custom image") : t("Website favicon")}</strong>
          <p className="page-note">{t("Automatic icons follow the saved website. Missing icons use initials.")}</p></div></div>
        <label htmlFor="app-icon">{t("Choose an image")}</label><input id="app-icon" type="file" accept="image/png,image/jpeg,image/webp"
          disabled={readingIcon} onChange={async event => {
            const file = event.target.files?.[0];
            if (!file) return;
            setReadingIcon(true);
            try {
              const icon = await readCustomIcon(file);
              if (mounted.current) onDraft({ ...draft, icon });
            }
            catch (error) { onError(errorMessage(error)); }
            finally { if (mounted.current) setReadingIcon(false); }
          }}/><button type="button" className="text-button" onClick={() => onDraft({ ...draft, icon: null })}>{t("Use website favicon")}</button></section>
      <section className="settings-card"><h2>{t("Notifications")}</h2>
        <label className="notification-toggle" htmlFor="app-notifications"><input id="app-notifications" type="checkbox"
          disabled={!origin} checked={Boolean(origin && draft.notificationOrigin === origin)}
          onChange={event => { setTestStatus(''); onDraft({ ...draft, notificationOrigin: event.target.checked ? origin : null }); }}/>
          <span>{t("Allow notifications from")}{' '}<strong>{origin ?? t('this website')}</strong></span></label>
        <p className="page-note">{t("Permission applies only to this app and website. Enable notifications in the service too, if it asks. Changing the website requires a new consent. Enabled services start with Rokko and stay connected in the background. Saving a permission change reloads this app without signing you out.")}</p>
        <button type="button" className="secondary" disabled={busy || testStatus === t('Sending…') || !app?.notificationOrigin || app.notificationOrigin !== draft.notificationOrigin}
          onClick={async () => {
            if (!app) return;
            setTestStatus(t("Sending…"));
            try { await window.rokko.testNotification(app.id); if (mounted.current) setTestStatus(t("Test notification sent.")); }
            catch (error) { if (mounted.current) setTestStatus(errorMessage(error)); }
          }}>{t("Send test notification")}</button><p className="page-note" role="status">{t(testStatus)}</p>
      </section>
      <div className="page-actions"><button className="primary" type="submit" disabled={busy || readingIcon}>
        {busy ? t("Saving…") : app ? t("Save changes") : t("Add application")}</button>
        <button className="secondary" type="button" disabled={busy} onClick={onBack}>{t("Cancel")}</button></div>
    </form>
    {app && <section className="settings-card danger-zone"><h2>{t("Remove application")}</h2>
      <p className="page-note">{t("This removes the service from Rokko. Its browser session data stays on this device.")}</p>
      {remove ? <div className="page-actions"><button className="danger-button" disabled={busy} onClick={onRemove}>{t("Confirm removal")}</button>
        <button className="secondary" onClick={() => setRemove(false)}>{t("Keep application")}</button></div>
        : <button className="danger-button" onClick={() => setRemove(true)}>{t("Remove application")}</button>}</section>}
  </div>;
}

export function WorkspaceSettingsPage({ workspace, data, busy, onSave, onRemove, onBack, onSession, onAccount }:
  { workspace?: Workspace; data: AppData; busy: boolean; onSave: (name: string) => void;
    onRemove: (destination: string) => void; onBack: () => void; onSession: (app: WebApp, shared: boolean) => void;
    onAccount: (provider: 'google' | 'microsoft') => void }) {
  const t = useI18n();
  const [name, setName] = useState(workspace?.name ?? '');
  const [destination, setDestination] = useState('');
  const count = data.apps.filter(app => app.workspaceId === workspace?.id).length;
  return <div className="settings-page">
    <div className="page-heading"><div>
      <h1>{workspace ? t('Edit {name}', { name: workspace.name }) : t("Create workspace")}</h1><p>{t("Organize your applications by context.")}</p></div></div>
    <div className="settings-grid"><form className="settings-form" onSubmit={event => { event.preventDefault(); onSave(name); }}>
      <section className="settings-card"><label htmlFor="workspace-name">{t("Workspace name")}</label>
        <input id="workspace-name" value={name} onChange={event => setName(event.target.value)} required maxLength={48} autoFocus/>
        <button className="primary" type="submit" disabled={busy}>{workspace ? t("Save workspace") : t("Create workspace")}</button></section>
    </form>{workspace && <section className="settings-card"><h2>{t("Workspace accounts")}</h2>
      <p className="page-note">{t("Sign in through the provider’s account page. Connected services use this workspace’s browser session, including Google sign-in where supported. Each workspace has its own session; passwords and cookies stay in Chromium.")}</p>
      <div className="page-actions"><button className="secondary" disabled={busy} onClick={() => onAccount('google')}>{t("Manage Google accounts")}</button>
        <button className="secondary" disabled={busy} onClick={() => onAccount('microsoft')}>{t("Manage Microsoft accounts")}</button></div>
      <p className="page-note">{t("The account page opens as a service in this workspace. The provider handles account selection and sign-out. Changing a service’s session keeps its previous login data on this device.")}</p>
      {data.apps.filter(app => app.workspaceId === workspace.id).map(app => <label className="notification-toggle" key={app.id}>
        <input type="checkbox" checked={sharesWorkspace(app)} disabled={busy}
          onChange={event => onSession(app, event.target.checked)}/><span>{app.name} · {sharesWorkspace(app) ? t("Workspace session") : t("Separate session")}</span></label>)}
    </section>}{workspace && <section className="settings-card danger-zone"><h2>{t("Remove workspace")}</h2>
      {data.workspaces.length <= 1 ? <p className="page-note">{t("Keep at least one workspace. Create another before removing this one.")}</p>
        : <><p className="page-note">{t("Move its")}{' '}{count}{t("application(s) to another workspace. Separate sessions are preserved; shared services use the destination workspace session.")}</p>
          <label htmlFor="workspace-destination">{t("Move applications to")}</label><select id="workspace-destination" value={destination}
            onChange={event => setDestination(event.target.value)}><option value="">{t("Choose a destination…")}</option>
            {data.workspaces.filter(item => item.id !== workspace.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select><button className="danger-button" disabled={busy || !destination} onClick={() => onRemove(destination)}>{t("Transfer applications and remove workspace")}</button></>}</section>}
  </div></div>;
}
