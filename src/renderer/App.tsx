import { RecoveryPage } from './pages/RecoveryPage';
import { ServiceControlsPage } from './pages/ServiceControlsPage';
import { ServiceErrorPage } from './pages/ServiceErrorPage';
import { useServiceViewport } from './hooks/useServiceViewport';
import { KeyboardShortcutsPage } from './pages/KeyboardShortcutsPage';
import { Button } from './components/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ContextMenuRequest,
  AppSnapshot,
  AppInput,
  AppLoadState,
  WebApp,
  Workspace,
} from '../shared/contracts/model';
import { sharesWorkspace } from '../shared/apps/sessions.mjs';
import { loadError } from '../shared/apps/load-errors.mjs';
import type { ServiceTemplate } from '../shared/services/service-catalog.mjs';
import { CatalogPage } from './pages/CatalogPage';
import { AppSettingsPage } from './pages/AppSettingsPage';
import { WorkspaceSettingsPage } from './pages/WorkspaceSettingsPage';
import { RamboxImportPage } from './pages/RamboxImportPage';
import { DesignStyles } from './components/ui/DesignStyles';
import { Icon } from './components/Icon';
import { Dock } from './components/Dock';
import { ManagementPage } from './pages/ManagementPage';
import { DashboardPage } from './pages/DashboardPage';
import { ApplicationSettingsPage } from './pages/ApplicationSettingsPage';
import { defaultPreferences } from '../shared/preferences/preferences.mjs';
import type { Preferences } from '../shared/preferences/preferences.mjs';
import { LanguageContext, translate, errorMessage } from './preferences/i18n';

const initial: AppSnapshot = {
  data: {
    version: 1,
    workspaces: [{ id: 'personal', name: 'Personal' }],
    apps: [],
    selectedWorkspaceId: 'personal',
  },
  activeAppId: null,
};

type Page =
  | 'home'
  | 'catalog'
  | 'app'
  | 'workspace'
  | 'manage'
  | 'import'
  | 'shortcuts'
  | 'dashboard'
  | 'settings'
  | 'controls'
  | 'services'
  | 'workspaces';
export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(initial);
  const [appStates, setAppStates] = useState<Record<string, AppLoadState>>({});
  const [page, setPage] = useState<Page>('dashboard');
  const [managementWorkspace, setManagementWorkspace] = useState<string | undefined>();
  const [editReturn, setEditReturn] = useState<Page>('services');
  const [removalRequested, setRemovalRequested] = useState(0);
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AppInput>({ name: '', url: '', workspaceId: 'personal' });
  const [draftKey, setDraftKey] = useState('custom');
  const [previewUrl, setPreviewUrl] = useState('');
  const appDrafts = useRef(new Map<string, AppInput>());
  const [error, setError] = useState('');
  const [dismissedNotices, setDismissedNotices] = useState('');
  const noticeKey = (snapshot.profileNotices ?? []).join('\n');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const draftBaseline = useRef('');
  const navigationOrigin = useRef<HTMLElement | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const active = snapshot.data.apps.find((app) => app.id === snapshot.activeAppId);
  const appState = active ? appStates[active.id] : undefined;
  const failure = appState?.status === 'failed' ? loadError(appState.error ?? -2) : null;
  const editingApp = snapshot.data.apps.find((app) => app.id === editingAppId);
  const editingWorkspace = snapshot.data.workspaces.find(
    (workspace) => workspace.id === editingWorkspaceId,
  );
  const preferences = snapshot.preferences ?? defaultPreferences();
  const contentRef = useServiceViewport(
    page,
    preferences.dock,
    snapshot.activeAppId,
    snapshot.data.selectedWorkspaceId,
    Boolean(active),
  );
  const t = (message: string, values?: Record<string, string | number>) =>
    translate(preferences.language, message, values);
  const [systemDark, setSystemDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    document.documentElement.lang = preferences.language;
  }, [preferences.language]);

  useEffect(() => {
    void window.rokko
      .getSnapshot()
      .then((value) => {
        setSnapshot(value);
        setAppStates(value.appStates ?? {});
        setPage(value.activeAppId ? 'home' : 'dashboard');
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(
    () =>
      window.rokko.onAppState((id, state) =>
        setAppStates((previous) => {
          const next = { ...previous };
          if (state) next[id] = state;
          else delete next[id];
          return next;
        }),
      ),
    [],
  );
  useEffect(
    () =>
      window.rokko.onSnapshot((value) => {
        setSnapshot(value);
        setPage(value.activeAppId ? 'home' : 'dashboard');
      }),
    [],
  );
  const run = useCallback(async (action: () => Promise<AppSnapshot>, nextPage?: Page) => {
    setBusy(true);
    setError('');
    try {
      setSnapshot(await action());
      if (nextPage) {
        setDirty(false);
        setPendingNavigation(null);
        setPage(nextPage === 'manage' ? 'services' : nextPage);
      }
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  const browserAction = async (action: () => Promise<void>): Promise<void> => {
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  function requestNavigation(action: () => void) {
    if (dirty) {
      navigationOrigin.current =
        contentRef.current?.querySelector<HTMLInputElement>('input:not([type=checkbox]),select') ??
        null;
      setPendingNavigation(() => action);
    } else {
      setPendingNavigation(null);
      action();
    }
  }
  function navigate(nextPage: Page) {
    requestNavigation(() => {
      setError('');
      setPage(nextPage === 'manage' ? 'services' : nextPage);
    });
  }
  function openApp(template?: ServiceTemplate, existing?: WebApp, remove = false) {
    requestNavigation(() => {
      setRemovalRequested((value) => (remove ? value + 1 : 0));
      const key = template?.id ?? 'custom';
      setEditReturn(
        page === 'workspaces' || page === 'services' || page === 'dashboard' ? page : 'services',
      );
      setEditingAppId(existing?.id ?? null);
      setDraftKey(key);
      const value = existing
        ? {
            name: existing.name,
            url: existing.url,
            workspaceId: existing.workspaceId,
            icon: existing.icon,
            notificationOrigin: existing.notificationOrigin,
            shareWorkspaceSession: sharesWorkspace(existing),
          }
        : (appDrafts.current.get(key) ?? {
            name: template?.name ?? '',
            url: template?.url ?? '',
            workspaceId: snapshot.data.selectedWorkspaceId,
            shareWorkspaceSession: true,
          });
      setDraft(value);
      draftBaseline.current = JSON.stringify(value);
      setDirty(false);
      setPreviewUrl(existing?.url ?? template?.url ?? '');
      setPage('app');
    });
  }
  function changeDraft(value: AppInput) {
    setDraft(value);
    setDirty(JSON.stringify(value) !== draftBaseline.current);
    if (!editingAppId) appDrafts.current.set(draftKey, value);
  }
  function openWorkspace(workspace?: Workspace, remove = false) {
    requestNavigation(() => {
      setRemovalRequested((value) => (remove ? value + 1 : 0));
      setDirty(false);
      setEditReturn(page === 'dashboard' ? 'dashboard' : 'workspaces');
      setEditingWorkspaceId(workspace?.id ?? null);
      setPage('workspace');
    });
  }
  async function saveApp() {
    if (
      await run(
        () =>
          editingAppId ? window.rokko.updateApp(editingAppId, draft) : window.rokko.addApp(draft),
        editingAppId ? editReturn : 'home',
      )
    )
      appDrafts.current.delete(draftKey);
  }
  const savePreferences = (value: Preferences) =>
    run(() =>
      window.rokko.setPreferences({
        ...value,
        cardOrder: value.cardOrder.filter(
          (id) => id === 'global' || snapshot.data.workspaces.some((w) => w.id === id),
        ),
        hiddenWorkspaces: value.hiddenWorkspaces.filter((id) =>
          snapshot.data.workspaces.some((w) => w.id === id),
        ),
      }),
    );
  function manageServices(workspaceId?: string) {
    setManagementWorkspace(workspaceId);
    navigate('services');
  }
  async function openService(service: WebApp) {
    if (service.workspaceId && preferences.hiddenWorkspaces.includes(service.workspaceId)) {
      if (
        !(await savePreferences({
          ...preferences,
          hiddenWorkspaces: preferences.hiddenWorkspaces.filter((id) => id !== service.workspaceId),
        }))
      )
        return;
    }
    await run(() => window.rokko.selectApp(service.id), 'home');
  }
  async function contextMenu(input: ContextMenuRequest) {
    try {
      const action = await window.rokko.showContextMenu(input);
      if (!action) return;
      const service = snapshot.data.apps.find((a) => a.id === input.id);
      const workspace = snapshot.data.workspaces.find((w) => w.id === input.id);
      if (input.kind === 'service' && service) {
        if (action === 'open')
          requestNavigation(() => {
            void openService(service);
          });
        else if (action === 'controls')
          requestNavigation(() => {
            void run(() => window.rokko.selectApp(service.id), 'controls');
          });
        else if (action === 'remove') openApp(undefined, service, true);
        else if (action === 'edit') openApp(undefined, service);
        else if (action === 'browser')
          await browserAction(() => window.rokko.openExternal(service.url));
      } else if (action === 'services') manageServices(input.id);
      else if (workspace && action === 'remove') openWorkspace(workspace, true);
      else if (workspace && action === 'reorder') navigate('dashboard');
      else if (workspace && action === 'edit') openWorkspace(workspace);
      else if (workspace && (action === 'hide' || action === 'show'))
        await savePreferences({
          ...preferences,
          hiddenWorkspaces:
            action === 'show'
              ? preferences.hiddenWorkspaces.filter((id) => id !== workspace.id)
              : [...new Set([...preferences.hiddenWorkspaces, workspace.id])],
        });
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  function openWorkspaceAccount(provider: 'google' | 'microsoft') {
    requestNavigation(() => {
      if (editingWorkspaceId)
        void run(async () => {
          const url =
            provider === 'google'
              ? 'https://accounts.google.com/'
              : 'https://account.microsoft.com/';
          const existing = snapshot.data.apps.find(
            (app) =>
              app.workspaceId === editingWorkspaceId && app.url === url && sharesWorkspace(app),
          );
          if (existing) {
            await window.rokko.selectWorkspace(editingWorkspaceId);
            return window.rokko.selectApp(existing.id);
          }
          return window.rokko.addApp({
            name: provider === 'google' ? 'Google accounts' : 'Microsoft accounts',
            url,
            workspaceId: editingWorkspaceId,
            shareWorkspaceSession: true,
          });
        }, 'home');
    });
  }

  if (snapshot.recovery)
    return (
      <LanguageContext value={preferences.language}>
        <DesignStyles
          seed={preferences.seed}
          dark={preferences.theme === 'dark' || (preferences.theme === 'system' && systemDark)}
        />
        <div className="app-shell">
          <section className="work-area">
            <div className="web-content" ref={contentRef}>
              <RecoveryPage
                recovery={snapshot.recovery}
                busy={busy}
                error={error}
                onRecover={(action) => void run(() => window.rokko.recoverProfile(action), 'home')}
              />
            </div>
          </section>
        </div>
      </LanguageContext>
    );
  return (
    <LanguageContext value={preferences.language}>
      <DesignStyles
        seed={preferences.seed}
        dark={preferences.theme === 'dark' || (preferences.theme === 'system' && systemDark)}
      />
      <div className={`app-shell dock-${preferences.dock}`}>
        <Dock
          data={snapshot.data}
          preferences={preferences}
          activeId={snapshot.activeAppId}
          page={page}
          onHome={() =>
            requestNavigation(() => {
              void run(() => window.rokko.selectApp(null), 'dashboard');
            })
          }
          onSettings={() => navigate('settings')}
          onApp={(id) =>
            requestNavigation(() => {
              void run(() => window.rokko.selectApp(id), 'home');
            })
          }
          onContext={(input) => void contextMenu(input)}
        />
        {page === 'home' && active && (
          <button
            className="service-menu icon-btn"
            aria-label={t('Service controls')}
            title={t('Service controls')}
            onClick={() => navigate('controls')}
          >
            <Icon name="more" />
          </button>
        )}
        <section className="work-area">
          {noticeKey && noticeKey !== dismissedNotices && (
            <section className="inline-confirm" role="status">
              {(snapshot.profileNotices ?? []).map((message) => (
                <p key={message}>{t(message)}</p>
              ))}
              <Button variant="secondary" onClick={() => setDismissedNotices(noticeKey)}>
                {t('Dismiss')}
              </Button>
            </section>
          )}
          {page !== 'home' && page !== 'dashboard' && (
            <div className="page-back">
              <button
                className="text-button"
                onClick={() =>
                  navigate(
                    page === 'app'
                      ? editingAppId
                        ? editReturn
                        : 'catalog'
                      : page === 'workspace'
                        ? editReturn
                        : active
                          ? 'home'
                          : 'dashboard',
                  )
                }
              >
                {t(
                  page === 'app' || page === 'workspace'
                    ? 'Back'
                    : active
                      ? 'Back to application'
                      : 'Home',
                )}
              </button>
            </div>
          )}
          {pendingNavigation && (
            <section className="inline-confirm" aria-labelledby="unsaved-title">
              <h2 id="unsaved-title">{t('Unsaved changes')}</h2>
              <p>{t('Leave this page without saving your changes?')}</p>
              <div className="page-actions">
                <Button
                  autoFocus
                  onClick={() => {
                    setPendingNavigation(null);
                    requestAnimationFrame(() => navigationOrigin.current?.focus());
                  }}
                >
                  {t('Continue editing')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const action = pendingNavigation;
                    setPendingNavigation(null);
                    setDirty(false);
                    if (page === 'app' && !editingAppId) appDrafts.current.delete(draftKey);
                    action();
                  }}
                >
                  {t('Discard changes')}
                </Button>
              </div>
            </section>
          )}
          {error && (
            <div role="alert" className="inline-error">
              <p>{t(error)}</p>
              <button
                className="icon-btn"
                aria-label={t('Dismiss error')}
                onClick={() => setError('')}
              >
                <Icon name="close" size={15} />
              </button>
            </div>
          )}
          <div className="web-content" ref={contentRef}>
            {(page === 'dashboard' || (page === 'home' && !active)) && (
              <DashboardPage
                data={snapshot.data}
                preferences={preferences}
                busy={busy}
                onPreferences={savePreferences}
                onMoveApp={(id, target, after) =>
                  run(() => window.rokko.moveApp(id, target, after))
                }
                onEditApp={(service) => openApp(undefined, service)}
                onEditWorkspace={openWorkspace}
                onNewWorkspace={() => openWorkspace()}
                onCatalog={() => navigate('catalog')}
                onImport={() => navigate('import')}
                onManageServices={() => manageServices()}
                onManageWorkspaces={() => navigate('workspaces')}
                onContext={(input) => void contextMenu(input)}
              />
            )}
            {(page === 'services' || page === 'workspaces') && (
              <ManagementPage
                key={page + (managementWorkspace ?? '')}
                mode={page}
                onContext={(input) => void contextMenu(input)}
                data={snapshot.data}
                preferences={preferences}
                initialWorkspace={managementWorkspace}
                busy={busy}
                onOpen={(service) => void openService(service)}
                onEditApp={(service) => openApp(undefined, service)}
                onEditWorkspace={openWorkspace}
                onCatalog={() => navigate('catalog')}
                onNewWorkspace={() => openWorkspace()}
                onVisibility={(workspace) =>
                  void savePreferences({
                    ...preferences,
                    hiddenWorkspaces: preferences.hiddenWorkspaces.includes(workspace.id)
                      ? preferences.hiddenWorkspaces.filter((id) => id !== workspace.id)
                      : [...preferences.hiddenWorkspaces, workspace.id],
                  })
                }
              />
            )}
            {page === 'settings' && (
              <ApplicationSettingsPage
                preferences={preferences}
                browserLanguage={snapshot.browserLanguage ?? preferences.language}
                busy={busy}
                onChange={(value) => void savePreferences(value)}
                onShortcuts={() => navigate('shortcuts')}
                onImport={() => navigate('import')}
                onManageServices={() => manageServices()}
                onManageWorkspaces={() => navigate('workspaces')}
              />
            )}
            {page === 'controls' && active && (
              <ServiceControlsPage
                name={active.name}
                canGoBack={appState?.canGoBack}
                canGoForward={appState?.canGoForward}
                onBack={() => {
                  void browserAction(() => window.rokko.goBack());
                  navigate('home');
                }}
                onForward={() => {
                  void browserAction(() => window.rokko.goForward());
                  navigate('home');
                }}
                onReload={() => {
                  void browserAction(() => window.rokko.reload());
                  navigate('home');
                }}
                onBrowser={() =>
                  void browserAction(() => window.rokko.openExternal(appState?.url ?? active.url))
                }
                onEdit={() => openApp(undefined, active)}
              />
            )}
            {page === 'home' && active && failure && (
              <ServiceErrorPage
                failure={failure}
                onRetry={() => void browserAction(() => window.rokko.reload())}
                onBrowser={() =>
                  void browserAction(() => window.rokko.openExternal(appState?.url ?? active.url))
                }
                onEdit={() => openApp(undefined, active)}
              />
            )}
            {page === 'shortcuts' && <KeyboardShortcutsPage />}
            {page === 'import' && (
              <RamboxImportPage data={snapshot.data} onImported={setSnapshot} />
            )}
            {page === 'catalog' && <CatalogPage onChoose={(template) => openApp(template)} />}
            {page === 'app' && (
              <AppSettingsPage
                key={editingAppId ?? draftKey}
                app={editingApp}
                draft={draft}
                onDraft={changeDraft}
                workspaces={snapshot.data.workspaces}
                removalRequested={removalRequested}
                previewUrl={previewUrl}
                busy={busy}
                onError={setError}
                onSave={() => void saveApp()}
                onBack={() => navigate(editingAppId ? editReturn : 'catalog')}
                onRemove={() => {
                  if (editingAppId)
                    void run(() => window.rokko.removeApp(editingAppId), editReturn);
                }}
              />
            )}
            {page === 'workspace' && (
              <WorkspaceSettingsPage
                key={editingWorkspaceId ?? 'new'}
                workspace={editingWorkspace}
                data={snapshot.data}
                removalRequested={removalRequested}
                busy={busy}
                onDirty={setDirty}
                onBack={() => navigate(editReturn)}
                onSave={(name) =>
                  void run(
                    () =>
                      editingWorkspaceId
                        ? window.rokko.renameWorkspace(editingWorkspaceId, name)
                        : window.rokko.addWorkspace(name),
                    editReturn,
                  )
                }
                onSession={(app, shared) =>
                  void run(() =>
                    window.rokko.updateApp(app.id, {
                      name: app.name,
                      url: app.url,
                      workspaceId: app.workspaceId,
                      icon: app.icon,
                      notificationOrigin: app.notificationOrigin,
                      shareWorkspaceSession: shared,
                    }),
                  )
                }
                onAccount={openWorkspaceAccount}
                onRemove={(destination) => {
                  if (editingWorkspaceId)
                    void run(
                      () => window.rokko.removeWorkspace(editingWorkspaceId, destination),
                      editReturn,
                    );
                }}
              />
            )}
          </div>
        </section>
      </div>
    </LanguageContext>
  );
}
