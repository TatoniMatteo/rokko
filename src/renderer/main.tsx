import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ContextMenuRequest, AppSnapshot, AppInput, AppLoadState, ViewBounds, WebApp, Workspace } from '../shared/contracts/model';
import { sharesWorkspace } from '../shared/apps/sessions.mjs';
import { loadError } from '../shared/apps/load-errors.mjs';
import type { ServiceTemplate } from '../shared/services/service-catalog.mjs';
import { CatalogPage, AppSettingsPage, WorkspaceSettingsPage } from './pages/SettingsPages';
import { RamboxImportPage } from './pages/RamboxImportPage';
import './styles/style.css';
import './styles/shell.css';
import { Icon } from './components/Icon';
import { Dock } from './components/Dock';
import { ManagementPage } from './pages/ManagementPage';
import { DashboardPage } from './pages/DashboardPage';
import { ApplicationSettingsPage } from './pages/ApplicationSettingsPage';
import { defaultPreferences } from '../shared/preferences/preferences.mjs';
import type { Preferences } from '../shared/preferences/preferences.mjs';
import { themeTokens } from '../shared/preferences/theme.mjs';
import { LanguageContext, translate, errorMessage } from './preferences/i18n';

const initial: AppSnapshot = {
  data: { version: 1, workspaces: [{ id: 'personal', name: 'Personal' }], apps: [], selectedWorkspaceId: 'personal' },
  activeAppId: null
};

type Page = 'home' | 'catalog' | 'app' | 'workspace' | 'manage' | 'import' | 'shortcuts' | 'dashboard' | 'settings' | 'controls' | 'services' | 'workspaces';
function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(initial);
  const [appStates, setAppStates] = useState<Record<string, AppLoadState>>({});
  const [page, setPage] = useState<Page>('dashboard');
  const [managementWorkspace, setManagementWorkspace] = useState<string | undefined>();
  const [editReturn, setEditReturn] = useState<Page>('services');
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
  const preferences = snapshot.preferences ?? defaultPreferences();
  const t = (message: string, values?: Record<string, string | number>) => translate(preferences.language, message, values);
  const [systemDark, setSystemDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(media.matches); media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const dark = preferences.theme === 'dark' || preferences.theme === 'system' && systemDark;
    for (const [key, value] of Object.entries(themeTokens(preferences.seed, dark))) document.documentElement.style.setProperty('--' + key, value);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    document.documentElement.lang = preferences.language;
  }, [preferences.theme, preferences.seed, preferences.language, systemDark]);

  useEffect(() => { void window.rokko.getSnapshot().then(value => {
    setSnapshot(value); setAppStates(value.appStates ?? {});
  }).catch(e => setError(errorMessage(e))); }, []);
  useEffect(() => window.rokko.onAppState((id, state) => setAppStates(previous => {
    const next = { ...previous }; if (state) next[id] = state; else delete next[id]; return next;
  })), []);
  useEffect(() => window.rokko.onSnapshot(value => { setSnapshot(value); setPage(value.activeAppId ? 'home' : 'dashboard'); }), []);
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
  }, [preferences.dock, page]);
  useEffect(() => {
    if (page === 'home' && active) return;
    const content = contentRef.current;
    if (content?.contains(document.activeElement) && document.activeElement !== content) return;
    const heading = content?.querySelector('h1');
    if (heading) { heading.tabIndex = -1; heading.focus(); }
  }, [page, snapshot.activeAppId, snapshot.data.selectedWorkspaceId]);
  const run = useCallback(async (action: () => Promise<AppSnapshot>, nextPage?: Page) => {
    setBusy(true); setError('');
    try { setSnapshot(await action()); if (nextPage) setPage(nextPage === 'manage' ? 'services' : nextPage); return true; }
    catch (e) { setError(errorMessage(e)); return false; }
    finally { setBusy(false); }
  }, []);
  const browserAction = async (action: () => Promise<void>): Promise<void> => {
    try { await action(); } catch (e) { setError(errorMessage(e)); }
  };
  function navigate(nextPage: Page) { setError(''); setPage(nextPage === 'manage' ? 'services' : nextPage); }
  function openApp(template?: ServiceTemplate, existing?: WebApp) {
    const key = template?.id ?? 'custom';
    setEditReturn(page === 'workspaces' || page === 'services' || page === 'dashboard' ? page : 'services');
    setEditingAppId(existing?.id ?? null); setDraftKey(key);
    setDraft(existing ? { name: existing.name, url: existing.url, workspaceId: existing.workspaceId, icon: existing.icon, notificationOrigin: existing.notificationOrigin, shareWorkspaceSession: sharesWorkspace(existing) }
      : appDrafts.current.get(key) ?? { name: template?.name ?? '', url: template?.url ?? '',
        workspaceId: snapshot.data.selectedWorkspaceId, shareWorkspaceSession: true });
    setPreviewUrl(existing?.url ?? template?.url ?? '');
    navigate('app');
  }
  function changeDraft(value: AppInput) {
    setDraft(value);
    if (!editingAppId) appDrafts.current.set(draftKey, value);
  }
  function openWorkspace(workspace?: Workspace) {
    setEditReturn(page === 'dashboard' ? 'dashboard' : 'workspaces');
    setEditingWorkspaceId(workspace?.id ?? null); navigate('workspace');
  }
  async function saveApp() {
    if (await run(() => editingAppId ? window.rokko.updateApp(editingAppId, draft) : window.rokko.addApp(draft),
      editingAppId ? editReturn : 'home')) appDrafts.current.delete(draftKey);
  }
  const savePreferences = (value: Preferences) => run(() => window.rokko.setPreferences({ ...value,
    cardOrder: value.cardOrder.filter(id => id === 'global' || snapshot.data.workspaces.some(w => w.id === id)),
    hiddenWorkspaces: value.hiddenWorkspaces.filter(id => snapshot.data.workspaces.some(w => w.id === id)) }));
  function manageServices(workspaceId?: string) { setManagementWorkspace(workspaceId); navigate('services'); }
  async function openService(service: WebApp) {
    if (service.workspaceId && preferences.hiddenWorkspaces.includes(service.workspaceId)) {
      if (!await savePreferences({ ...preferences, hiddenWorkspaces: preferences.hiddenWorkspaces.filter(id => id !== service.workspaceId) })) return;
    }
    await run(() => window.rokko.selectApp(service.id), 'home');
  }
  async function contextMenu(input: ContextMenuRequest) {
    try {
      const action = await window.rokko.showContextMenu(input);
      if (!action) return;
      const service = snapshot.data.apps.find(a => a.id === input.id);
      const workspace = snapshot.data.workspaces.find(w => w.id === input.id);
      if (input.kind === 'service' && service) {
        if (action === 'open') await openService(service);
        else if (action === 'edit') openApp(undefined, service);
        else if (action === 'browser') await browserAction(() => window.rokko.openExternal(service.url));
      } else if (action === 'services') manageServices(input.id);
      else if (workspace && action === 'edit') openWorkspace(workspace);
      else if (workspace && (action === 'hide' || action === 'show')) await savePreferences({ ...preferences, hiddenWorkspaces: action === 'show' ? preferences.hiddenWorkspaces.filter(id => id !== workspace.id)
          : [...new Set([...preferences.hiddenWorkspaces, workspace.id])] });
    } catch (error) { setError(errorMessage(error)); }
  }
  return <LanguageContext value={preferences.language}>
    <div className={`app-shell dock-${preferences.dock}`}>
      <Dock data={snapshot.data} preferences={preferences} activeId={snapshot.activeAppId} page={page}
        onHome={() => { void run(() => window.rokko.selectApp(null), 'dashboard'); }} onSettings={() => navigate('settings')}
        onApp={id => void run(() => window.rokko.selectApp(id), 'home')} onContext={input => void contextMenu(input)}/>
      {page === 'home' && active && <button className="service-menu icon-btn" aria-label={t('Service controls')}
        title={t('Service controls')} onClick={() => navigate('controls')}><Icon name="more"/></button>}
      <section className="work-area">
        {page !== 'home' && page !== 'dashboard' && <div className="page-back"><button className="text-button"
          onClick={() => navigate(page === 'app' ? editingAppId ? editReturn : 'catalog' : page === 'workspace' ? editReturn : active ? 'home' : 'dashboard')}>
            {t(page === 'app' || page === 'workspace' ? 'Back' : active ? 'Back to application' : 'Home')}</button></div>}
        <div className="web-content" ref={contentRef}>
          {(page === 'dashboard' || page === 'home' && !active) && <DashboardPage data={snapshot.data} preferences={preferences}
            busy={busy} onPreferences={savePreferences} onMoveApp={(id, target, after) => run(() => window.rokko.moveApp(id, target, after))}
            onEditApp={service => openApp(undefined, service)} onEditWorkspace={openWorkspace} onNewWorkspace={() => openWorkspace()}
            onCatalog={() => navigate('catalog')} onManageServices={() => manageServices()} onManageWorkspaces={() => navigate('workspaces')} onContext={input => void contextMenu(input)}/>}
          {(page === 'services' || page === 'workspaces') && <ManagementPage key={page + (managementWorkspace ?? '')} mode={page} onContext={input => void contextMenu(input)}
            data={snapshot.data} preferences={preferences} initialWorkspace={managementWorkspace} busy={busy}
            onOpen={service => void openService(service)} onEditApp={service => openApp(undefined, service)} onEditWorkspace={openWorkspace}
            onCatalog={() => navigate('catalog')} onNewWorkspace={() => openWorkspace()}
            onVisibility={workspace => void savePreferences({ ...preferences, hiddenWorkspaces: preferences.hiddenWorkspaces.includes(workspace.id)
              ? preferences.hiddenWorkspaces.filter(id => id !== workspace.id) : [...preferences.hiddenWorkspaces, workspace.id] })}/>}
          {page === 'settings' && <ApplicationSettingsPage preferences={preferences} browserLanguage={snapshot.browserLanguage ?? preferences.language}
            busy={busy} onChange={value => void savePreferences(value)} onShortcuts={() => navigate('shortcuts')} onImport={() => navigate('import')} onManageServices={() => manageServices()} onManageWorkspaces={() => navigate('workspaces')}/>}
          {page === 'controls' && active && <div className="settings-page"><h1>{active.name}</h1><section className="settings-card">
            <div className="page-actions"><button className="secondary" disabled={!appState?.canGoBack} onClick={() => { void browserAction(() => window.rokko.goBack()); navigate('home'); }}>{t('Go back')}</button>
              <button className="secondary" disabled={!appState?.canGoForward} onClick={() => { void browserAction(() => window.rokko.goForward()); navigate('home'); }}>{t('Go forward')}</button>
              <button className="secondary" onClick={() => { void browserAction(() => window.rokko.reload()); navigate('home'); }}>{t('Reload')}</button>
              <button className="secondary" onClick={() => void browserAction(() => window.rokko.openExternal(appState?.url ?? active.url))}>{t('Open in browser')}</button>
              <button className="secondary" onClick={() => openApp(undefined, active)}>{t('Edit application')}</button></div>
          </section></div>}
          {page === 'home' && active && failure && <div className="service-error" role="alert">
            <h1>{t(failure.title)}</h1><p>{t(failure.message)}</p>
            <div className="page-actions"><button className="primary" onClick={() => void browserAction(() => window.rokko.reload())}>{t("Try again")}</button><button className="secondary" onClick={() => void browserAction(() => window.rokko.openExternal(appState?.url ?? active.url))}>{t("Open in browser")}</button><button className="secondary" onClick={() => openApp(undefined, active)}>{t("Edit application")}</button></div>
          </div>}
          {page === 'shortcuts' && <div className="settings-page"><div className="page-heading"><div>
            <h1>{t("Keyboard shortcuts")}</h1>
            <p>{t("Move between applications without leaving the keyboard.")}</p></div></div>
            <section className="settings-card"><dl className="shortcut-list">
              <dt><kbd>{t("Ctrl + Tab")}</kbd></dt><dd>{t("Next application in this workspace")}</dd>
              <dt><kbd>{t("Ctrl + Shift + Tab")}</kbd></dt><dd>{t("Previous application in this workspace")}</dd>
              <dt><kbd>{t("Alt + 1…9")}</kbd></dt><dd>{t("Application at this position in the sidebar")}</dd>
              <dt><kbd>{t("Alt + PageUp / PageDown")}</kbd></dt><dd>{t("Previous / next workspace")}</dd>
              <dt><kbd>{t("Alt + Home")}</kbd></dt><dd>{t("Return to Rokko home")}</dd>
            </dl><p className="page-note">{t("Available while using applications, including inside their pages. Navigation shortcuts pause on configuration pages so you can edit safely. Use Tab and Shift + Tab to move through controls, then Enter or Space to activate them.")}</p></section></div>}
          {page === 'import' && <RamboxImportPage data={snapshot.data} onImported={setSnapshot}/>}
          {page === 'catalog' && <CatalogPage onChoose={template => openApp(template)}/>}
          {page === 'app' && <AppSettingsPage key={editingAppId ?? draftKey} app={editingApp} draft={draft} onDraft={changeDraft}
            workspaces={snapshot.data.workspaces} previewUrl={previewUrl} busy={busy} onError={setError}
            onSave={() => void saveApp()} onBack={() => navigate(editingAppId ? editReturn : 'catalog')}
            onRemove={() => { if (editingAppId) void run(() => window.rokko.removeApp(editingAppId), editReturn); }}/>}
          {page === 'workspace' && <WorkspaceSettingsPage key={editingWorkspaceId ?? 'new'} workspace={editingWorkspace}
            data={snapshot.data} busy={busy} onBack={() => navigate(editReturn)}
            onSave={name => void run(() => editingWorkspaceId ? window.rokko.renameWorkspace(editingWorkspaceId, name)
              : window.rokko.addWorkspace(name), editReturn)}
            onSession={(app, shared) => void run(() => window.rokko.updateApp(app.id, {
              name: app.name, url: app.url, workspaceId: app.workspaceId, icon: app.icon,
              notificationOrigin: app.notificationOrigin, shareWorkspaceSession: shared }))}
            onAccount={provider => { if (editingWorkspaceId) void run(async () => {
              const url = provider === 'google' ? 'https://accounts.google.com/' : 'https://account.microsoft.com/';
              const existing = snapshot.data.apps.find(app => app.workspaceId === editingWorkspaceId && app.url === url && sharesWorkspace(app));
              if (existing) { await window.rokko.selectWorkspace(editingWorkspaceId); return window.rokko.selectApp(existing.id); }
              return window.rokko.addApp({ name: provider === 'google' ? 'Google accounts' : 'Microsoft accounts',
                url, workspaceId: editingWorkspaceId, shareWorkspaceSession: true });
            }, 'home'); }}
            onRemove={destination => { if (editingWorkspaceId) void run(() => window.rokko.removeWorkspace(editingWorkspaceId, destination), editReturn); }}/>}

        </div>
      </section>
    {error && <div role="alert" className="error-toast"><span>{t(error)}</span><button aria-label={t("Dismiss error")} onClick={() => setError('')}><Icon name="close" size={15}/></button></div>}
  </div></LanguageContext>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
