import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppSnapshot, AppInput, AppLoadState, ViewBounds, WebApp, Workspace } from '../shared/contracts/model';
import { loadError } from '../shared/apps/load-errors.mjs';
import type { ServiceTemplate } from '../shared/services/service-catalog.mjs';
import { CatalogPage, AppSettingsPage, WorkspaceSettingsPage, ManagePage } from './pages/SettingsPages';
import { RamboxImportPage } from './pages/RamboxImportPage';
import { ServiceIcon } from './components/ServiceIcon';
import raccoonUrl from '../../assets/brand/rokko-dark-icon.png';
import './styles/style.css';

const initial: AppSnapshot = {
  data: { version: 1, workspaces: [{ id: 'personal', name: 'Personal' }], apps: [], selectedWorkspaceId: 'personal' },
  activeAppId: null
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    reload: <><path d="M20 11a8 8 0 1 1-2.4-5.7"/><path d="M20 4v6h-6"/></>,
    back: <path d="m15 18-6-6 6-6"/>,
    forward: <path d="m9 6 6 6-6 6"/>,
    external: <><path d="M14 4h6v6m0-6-9 9"/><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M5 6l1 15h12l1-15M10 10v7m4-7v7"/></>,
    moon: <path d="M20 15a8 8 0 0 1-11-11A8 8 0 1 0 20 15Z"/>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18M12 3c-5 5-5 13 0 18"/></>,
    close: <path d="M5 5l14 14M19 5 5 19"/>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.globe}</svg>;
}

function Raccoon({ size = 42 }: { size?: number }) {
  return <img src={raccoonUrl} width={size} height={size} alt="Rokko raccoon"/>;
}

type Page = 'home' | 'catalog' | 'app' | 'workspace' | 'manage' | 'import';
function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(initial);
  const [appStates, setAppStates] = useState<Record<string, AppLoadState>>({});
  const [page, setPage] = useState<Page>('home');
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AppInput>({ name: '', url: '', workspaceId: 'personal' });
  const [draftKey, setDraftKey] = useState('custom');
  const [previewUrl, setPreviewUrl] = useState('');
  const appDrafts = useRef(new Map<string, AppInput>());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const active = snapshot.data.apps.find(app => app.id === snapshot.activeAppId);
  const appState = active ? appStates[active.id] : undefined;
  const failure = appState?.status === 'failed' ? loadError(appState.error ?? -2) : null;
  const editingApp = snapshot.data.apps.find(app => app.id === editingAppId);
  const editingWorkspace = snapshot.data.workspaces.find(workspace => workspace.id === editingWorkspaceId);
  const workspaceApps = snapshot.data.apps.filter(app => app.workspaceId === snapshot.data.selectedWorkspaceId);
  const pageTitle = { home: active?.name ?? 'Home', catalog: 'Applications', app: 'Application settings',
    workspace: 'Workspace settings', manage: 'Manage applications', import: 'Import from Rambox' }[page];

  useEffect(() => { void window.rokko.getSnapshot().then(value => {
    setSnapshot(value); setAppStates(value.appStates ?? {});
  }).catch(e => setError(String(e))); }, []);
  useEffect(() => window.rokko.onAppState((id, state) => setAppStates(previous => {
    const next = { ...previous }; if (state) next[id] = state; else delete next[id]; return next;
  })), []);
  useEffect(() => window.rokko.onSnapshot(value => { setSnapshot(value); setPage('home'); }), []);
  useEffect(() => { window.rokko.setOverlayOpen(page !== 'home'); }, [page]);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const bounds: ViewBounds = { x: Math.round(r.x), y: Math.round(r.y),
        width: Math.max(0, Math.floor(r.width)), height: Math.max(0, Math.floor(r.height)) };
      window.rokko.updateBounds(bounds);
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener('resize', update);
    update();
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, []);
  const run = useCallback(async (action: () => Promise<AppSnapshot>, nextPage?: Page) => {
    setBusy(true); setError('');
    try { setSnapshot(await action()); if (nextPage) setPage(nextPage); return true; }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return false; }
    finally { setBusy(false); }
  }, []);
  const browserAction = async (action: () => Promise<void>): Promise<void> => {
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  function navigate(nextPage: Page) { setError(''); setPage(nextPage); }
  function openApp(template?: ServiceTemplate, existing?: WebApp) {
    const key = template?.id ?? 'custom';
    setEditingAppId(existing?.id ?? null); setDraftKey(key);
    setDraft(existing ? { name: existing.name, url: existing.url, workspaceId: existing.workspaceId, icon: existing.icon, notificationOrigin: existing.notificationOrigin }
      : appDrafts.current.get(key) ?? { name: template?.name ?? '', url: template?.url ?? '',
        workspaceId: snapshot.data.selectedWorkspaceId });
    setPreviewUrl(existing?.url ?? template?.url ?? '');
    navigate('app');
  }
  function changeDraft(value: AppInput) {
    setDraft(value);
    if (!editingAppId) appDrafts.current.set(draftKey, value);
  }
  function openWorkspace(workspace?: Workspace) {
    setEditingWorkspaceId(workspace?.id ?? null); navigate('workspace');
  }
  async function saveApp() {
    if (await run(() => editingAppId ? window.rokko.updateApp(editingAppId, draft) : window.rokko.addApp(draft),
      editingAppId ? 'manage' : 'home')) appDrafts.current.delete(draftKey);
  }
  return <div className="app-shell">
    <div className="topbar">
      <div className="brand"><span className="brand-icon"><Raccoon size={27}/></span><span>rokko</span>
        <span className="edition">ALPHA</span></div>
      <div className="top-center">Your digital workspace, simplified.</div>
      <div className="top-right"><span className="status-dot"/> Local workspace
        <button className="icon-btn" title="Manage applications" onClick={() => navigate('manage')}><Icon name="settings"/></button></div>
    </div>
    <div className="layout">
      <aside className="sidebar">
        <button className="quick-search" disabled title="Command palette prevista nella roadmap"><Icon name="search" size={17}/> Quick switch <kbd>⌘ K</kbd></button>
        <div className="section-label">WORKSPACES <button title="New workspace" onClick={() => openWorkspace()}><Icon name="plus" size={16}/></button></div>
        <div className="workspace-list">{snapshot.data.workspaces.map(workspace => <div className="service-entry" key={workspace.id}>
          <button className={`workspace-item ${workspace.id === snapshot.data.selectedWorkspaceId ? 'active' : ''}`}
            onClick={() => void run(() => window.rokko.selectWorkspace(workspace.id), 'home')}>
            <Icon name="grid" size={16}/><span>{workspace.name}</span></button>
          <button className="row-action icon-btn" aria-label={`Edit workspace ${workspace.name}`} onClick={() => openWorkspace(workspace)}>
            <Icon name="settings" size={15}/></button></div>)}</div>
        <div className="section-label app-section">APPLICATIONS <span>{workspaceApps.length}</span></div>
        <div className="app-list">{workspaceApps.map(app => <div className="service-entry" key={app.id}>
          <button className={`app-item ${app.id === snapshot.activeAppId ? 'active' : ''}`}
            onClick={() => void run(() => window.rokko.selectApp(app.id), 'home')}>
            <ServiceIcon name={app.name} url={app.url} icon={app.icon}/><span className="app-name">{app.name}</span>
            {app.id === snapshot.activeAppId && <span className="selected-dot"/>}</button>
          <button className="row-action icon-btn" aria-label={`Edit ${app.name}`} onClick={() => openApp(undefined, app)}>
            <Icon name="settings" size={15}/></button></div>)}</div>
        <button className="add-app" onClick={() => navigate('catalog')}><Icon name="plus" size={17}/> Add application</button>
        <div className="sidebar-bottom"><div className="privacy"><Icon name="moon" size={16}/><span>Midnight theme</span></div>
          <button className="text-button manage-link" onClick={() => navigate('manage')}>Manage applications</button>
          <button className="text-button manage-link" onClick={() => navigate('import')}>Import from Rambox</button>
          <div className="version">Rokko alpha<br/>Linux-first · Local-only</div></div>
      </aside>
      <section className="work-area">
        <header className="app-toolbar"><div className="toolbar-title"><span className="toolbar-icon"><Icon name="globe" size={17}/></span>
          <strong>{pageTitle}</strong><span className="toolbar-url">{page === 'home' ? appState?.url ?? active?.url ?? 'Welcome to Rokko' : 'Settings'}</span>
          {page === 'home' && active && <span className="load-status" role="status">
            {appState?.status === 'loading' ? 'Loading…' : appState?.status === 'failed' ? 'Connection failed' : ''}</span>}</div>
          <div className="toolbar-actions">{page !== 'home' && <button className="secondary compact" onClick={() => navigate('home')}>Back to applications</button>}
            {page === 'home' && active && <>
              <button className="icon-btn" title="Indietro" aria-label="Go back" disabled={!appState?.canGoBack}
                onClick={() => void browserAction(() => window.rokko.goBack())}><Icon name="back"/></button>
              <button className="icon-btn" title="Avanti" aria-label="Go forward" disabled={!appState?.canGoForward}
                onClick={() => void browserAction(() => window.rokko.goForward())}><Icon name="forward"/></button>
              <button className="icon-btn" title="Ricarica" onClick={() => void browserAction(() => window.rokko.reload())}><Icon name="reload"/></button>
              <button className="icon-btn" title="Apri nel browser" onClick={() => void window.rokko.openExternal(active.url)}><Icon name="external"/></button>
              <button className="icon-btn" title="Edit application" onClick={() => openApp(undefined, active)}><Icon name="settings"/></button>
            </>}</div>
        </header>
        <div className="web-content" ref={contentRef}>
          {page === 'home' && active && failure && <div className="service-error" role="alert">
            <span className="page-eyebrow">{active.name}</span><h1>{failure.title}</h1><p>{failure.message}</p>
            <div className="page-actions"><button className="primary" onClick={() => void browserAction(() => window.rokko.reload())}>
              Try again</button><button className="secondary" onClick={() => void browserAction(() => window.rokko.openExternal(appState?.url ?? active.url))}>
              Open in browser</button><button className="secondary" onClick={() => openApp(undefined, active)}>Edit application</button></div>
          </div>}
          {page === 'import' && <RamboxImportPage data={snapshot.data} onImported={setSnapshot}/>}
          {page === 'catalog' && <CatalogPage onChoose={template => openApp(template)}/>}
          {page === 'app' && <AppSettingsPage key={editingAppId ?? draftKey} app={editingApp} draft={draft} onDraft={changeDraft}
            workspaces={snapshot.data.workspaces} previewUrl={previewUrl} busy={busy} onError={setError}
            onSave={() => void saveApp()} onBack={() => navigate(editingAppId ? 'manage' : 'catalog')}
            onRemove={() => { if (editingAppId) void run(() => window.rokko.removeApp(editingAppId), 'manage'); }}/>}
          {page === 'workspace' && <WorkspaceSettingsPage key={editingWorkspaceId ?? 'new'} workspace={editingWorkspace}
            data={snapshot.data} busy={busy} onBack={() => navigate('manage')}
            onSave={name => void run(() => editingWorkspaceId ? window.rokko.renameWorkspace(editingWorkspaceId, name)
              : window.rokko.addWorkspace(name), 'manage')}
            onRemove={destination => { if (editingWorkspaceId) void run(() => window.rokko.removeWorkspace(editingWorkspaceId, destination), 'manage'); }}/>}
          {page === 'manage' && <ManagePage data={snapshot.data} busy={busy} onEditApp={app => openApp(undefined, app)}
            onEditWorkspace={openWorkspace} onNewWorkspace={() => openWorkspace()} onCatalog={() => navigate('catalog')}
            onReorder={(id, direction) => void run(() => window.rokko.reorderApp(id, direction))}/>}
          {page === 'home' && !active && <div className="welcome"><div className="welcome-glow"><Raccoon size={116}/></div>
            <div className="eyebrow">YOUR SPACE, YOUR RULES</div><h1>Everything in one <em>clever</em> place.</h1>
            <p>Keep your favorite web apps together. Separate accounts, organize workspaces, and stay in control.</p>
            <button className="primary" onClick={() => navigate('catalog')}><Icon name="plus" size={18}/> Add your first app</button>
            <div className="welcome-features"><span>◈ Private sessions</span><span>◈ Local configuration</span><span>◈ Linux first</span></div>
          </div>}
        </div>
        <footer className="statusbar"><span><span className="status-dot"/> {active ? `${active.name} · running` : 'Ready'}</span>
          <span>Rokko · locally yours</span></footer>
      </section>
    </div>
    {error && <div role="alert" className="error-toast"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><Icon name="close" size={15}/></button></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
