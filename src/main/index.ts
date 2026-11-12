import { app, Menu, BaseWindow, ipcMain, WebContentsView, session, shell, Notification as DesktopNotification } from 'electron';
import appIcon from '../../assets/brand/rokko-dark-icon.png?asset';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { ContextMenuAction, AppData, AppSnapshot, AppLoadState, ViewBounds, WebApp } from '../shared/contracts/model';
import { notificationAllowed, notificationOrigin, validNotificationGrant } from '../shared/notifications/notifications.mjs';
import { serviceCatalog } from '../shared/services/service-catalog.mjs';
import { fetchFavicon, validIcon } from '../shared/services/service-icons.mjs';
import { appInput, updateApp, renameWorkspace, removeWorkspace, reorderApp } from '../shared/apps/registry.mjs';
import { normalizeHttpsUrl, validTitle, validBounds } from '../shared/security/validation.mjs';
import { stopServiceWorkers } from './lifecycle/worker-lifecycle.mjs';
import { PersistentNotifications } from './notifications/persistent-notifications';
import { sharesWorkspace, servicePartition } from '../shared/apps/sessions.mjs';
import { shortcutTarget } from './navigation/shortcuts.mjs';
import { contextMenuItems } from './navigation/context-menu.mjs';
import { readMetadata } from './import/rambox-mcp.mjs';
import { parseRamboxMetadata, planRamboxImport } from '../shared/import/rambox.mjs';

import { defaultPreferences, validatePreferences, dockApps, moveApp, languageList } from '../shared/preferences/preferences.mjs';

const preferencesPath = (): string => join(app.getPath('userData'), 'rokko-preferences.json');
let preferences = defaultPreferences();
try { preferences = validatePreferences(JSON.parse(readFileSync(preferencesPath(), 'utf8'))); } catch { /* Compatible defaults. */ }
const browserLanguage = preferences.language;
app.commandLine.appendSwitch('lang', browserLanguage === 'it' ? 'it-IT' : 'en-US');
function savePreferences(next: typeof preferences): void {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(preferencesPath() + '.tmp', JSON.stringify(next), { mode: 0o600 });
  renameSync(preferencesPath() + '.tmp', preferencesPath());
  preferences = next;
}

const emptyData = (): AppData => ({
  version: 1,
  workspaces: [{ id: 'personal', name: 'Personal' }],
  apps: [],
  selectedWorkspaceId: 'personal'
});
let data: AppData = emptyData();
let win: BaseWindow | null = null;
let shellView: WebContentsView | null = null;
const views = new Map<string, WebContentsView>();
const appStates = new Map<string, AppLoadState>();
let activeAppId: string | null = null;
let overlayOpen = false;
let bounds: ViewBounds = { x: 238, y: 106, width: 942, height: 550 };
let persistentNotifications: PersistentNotifications;
const permissionSessions = new WeakSet<Electron.Session>();
const accountWindows = new Map<string, Set<Electron.BrowserWindow>>();

function statePath(): string { return join(app.getPath('userData'), 'rokko-state.json'); }
function loadData(): void {
  try {
    const value: unknown = JSON.parse(readFileSync(statePath(), 'utf8'));
    if (isData(value)) data = value;
  } catch { /* Initial launch, or invalid state: keep safe defaults. */ }
}
function isData(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<AppData>;
  return v.version === 1 && Array.isArray(v.workspaces) && Array.isArray(v.apps) &&
    typeof v.selectedWorkspaceId === 'string' &&
    v.workspaces.every(w => typeof w?.id === 'string' && typeof w?.name === 'string') &&
    v.apps.every(a => typeof a?.id === 'string' && typeof a?.name === 'string' &&
      typeof a?.url === 'string' && (a?.workspaceId === null || typeof a?.workspaceId === 'string') &&
      typeof a?.partition === 'string' && a.partition.startsWith('persist:rokko-') &&
      isSafeHttps(a.url) && isValidStoredIcon(a.icon) && isValidStoredGrant(a.notificationOrigin, a.url));
}
function isValidStoredGrant(value: unknown, url: string): boolean {
  try { validNotificationGrant(value, url); return true; } catch { return false; }
}
function isValidStoredIcon(value: unknown): boolean {
  try { validIcon(value); return true; } catch { return false; }
}
function isSafeHttps(value: string): boolean {
  try { return normalizeHttpsUrl(value) === value; } catch { return false; }
}
function saveData(value: AppData = data): void {
  const file = statePath();
  mkdirSync(app.getPath('userData'), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(tmp, file);
}
function snapshot(): AppSnapshot { return { data, activeAppId, appStates: Object.fromEntries(appStates), preferences, browserLanguage }; }
function updateAppState(id: string, state: AppLoadState): void {
  if (!views.has(id)) return;
  const previous = appStates.get(id);
  appStates.set(id, state);
  shellView?.webContents.send('rokko:app-state', id, state);
  if (id === activeAppId && (previous?.status === 'failed' || state.status === 'failed')) redrawView();
}
function installNavigation(contents: Electron.WebContents): void {
  contents.on('before-input-event', (event, input) => {
    if (!shellView || (contents !== shellView.webContents &&
        contents !== (activeAppId ? views.get(activeAppId)?.webContents : undefined))) return;
    const target = shortcutTarget(data, activeAppId, input, overlayOpen, preferences);
    if (!target) return;
    event.preventDefault();
    try {
      if (target.workspaceId !== data.selectedWorkspaceId) {
        const next = { ...data, selectedWorkspaceId: target.workspaceId };
        saveData(next); data = next;
      }
      setActive(target.appId);
      shellView.webContents.send('rokko:snapshot-changed', snapshot());
      const view = target.appId ? views.get(target.appId) : undefined;
      if (view && appStates.get(target.appId!)?.status !== 'failed') view.webContents.focus();
      else shellView.webContents.focus();
    } catch { /* Keep the previous selection if persistence fails. */ }
  });
}
function requireShell(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): void {
  if (!shellView || event.sender !== shellView.webContents) throw new Error('Unauthorized renderer');
}
function selectedApp(): WebApp | undefined { return data.apps.find(a => a.id === activeAppId); }
function detachViews(): void {
  if (!win) return;
  for (const view of views.values()) {
    try { win.contentView.removeChildView(view); } catch { /* not attached */ }
  }
}
function ensureView(appInfo: WebApp): WebContentsView {
  let view = views.get(appInfo.id);
  if (!view) {
    const partitionSession = session.fromPartition(appInfo.partition);
    partitionSession.setUserAgent(partitionSession.getUserAgent(), languageList(browserLanguage));
    persistentNotifications.configure(appInfo, partitionSession);
    if (!permissionSessions.has(partitionSession)) {
      permissionSessions.add(partitionSession);
      const allowed = (requester: Electron.WebContents | null, permission: string, origin: string): boolean =>
        data.apps.some(item => item.partition === appInfo.partition &&
          (!requester || views.get(item.id)?.webContents === requester) && notificationAllowed(item, permission, origin));
      partitionSession.setPermissionRequestHandler((requester, permission, callback, details) =>
        callback(allowed(requester, permission, details.requestingUrl)));
      partitionSession.setPermissionCheckHandler((requester, permission, origin) => allowed(requester, permission, origin));
    }
    view = new WebContentsView({ webPreferences: {
      session: partitionSession, nodeIntegration: false, contextIsolation: true, sandbox: true
    } });
    view.setBorderRadius(23);
    const remote = view.webContents;
    installNavigation(remote);
    remote.on('page-favicon-updated', (_event, urls) => {
      const service = data.apps.find(item => item.id === appInfo.id);
      if (!service || !urls.length) return;
      void loadServiceIcon(service.url).then(icon => icon ?? loadServiceIcon(service.url, urls)).then(icon => {
        if (icon && data.apps.some(item => item.id === service.id && item.url === service.url)) {
          shellView?.webContents.send('rokko:service-icon-changed', service.url, icon);
        }
      }).catch(() => {});
    });
    views.set(appInfo.id, view);
    const report = (status: AppLoadState['status'], url = appStates.get(appInfo.id)?.url ?? appInfo.url,
      error?: AppLoadState['error']): void => {
      if (views.get(appInfo.id)?.webContents !== remote || remote.isDestroyed()) return;
      updateAppState(appInfo.id, { status, url: isSafeHttpsUrl(url) ? url : appInfo.url, error,
        canGoBack: remote.navigationHistory.canGoBack(), canGoForward: remote.navigationHistory.canGoForward() });
    };
    report('loading');
    remote.on('did-start-navigation', (_event, url, inPlace, mainFrame) => {
      if (mainFrame && !inPlace && isSafeHttpsUrl(url)) report('loading', url);
    });
    remote.on('did-fail-load', (_event, code, _description, url, mainFrame) => {
      if (mainFrame && code !== -3) report('failed', url, code);
    });
    remote.on('did-finish-load', () => {
      if (appStates.get(appInfo.id)?.status !== 'failed') report('ready', remote.getURL());
    });
    remote.on('did-stop-loading', () => {
      if (appStates.get(appInfo.id)?.status === 'loading') report('ready', remote.getURL());
    });
    remote.on('did-navigate', (_event, url) => {
      report(appStates.get(appInfo.id)?.status === 'failed' ? 'failed' : 'loading', url,
        appStates.get(appInfo.id)?.error);
    });
    remote.on('did-navigate-in-page', (_event, url, mainFrame) => {
      if (mainFrame) report(appStates.get(appInfo.id)?.status ?? 'ready', url, appStates.get(appInfo.id)?.error);
    });
    remote.setWindowOpenHandler(({ url }) => {
      const service = data.apps.find(item => item.id === appInfo.id);
      const accountPopup = !url || url === 'about:blank' || (isSafeHttpsUrl(url) &&
        ['accounts.google.com', 'login.microsoftonline.com', 'login.live.com'].includes(new URL(url).hostname));
      if (service && sharesWorkspace(service) && accountPopup && (accountWindows.get(service.id)?.size ?? 0) < 2) {
        return { action: 'allow', overrideBrowserWindowOptions: { parent: win ?? undefined, fullscreenable: false,
          webPreferences: { session: partitionSession, nodeIntegration: false, contextIsolation: true, sandbox: true } } };
      }
      if (isSafeHttpsUrl(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    remote.on('did-create-window', child => {
      const children = accountWindows.get(appInfo.id) ?? new Set<Electron.BrowserWindow>();
      accountWindows.set(appInfo.id, children); children.add(child);
      const showOrigin = (): void => child.setTitle(`Rokko · ${notificationOrigin(child.webContents.getURL()) ?? (preferences.language === 'it' ? 'Accedi' : 'Sign in')}`);
      child.on('page-title-updated', event => { event.preventDefault(); showOrigin(); });
      child.webContents.on('did-navigate', showOrigin);
      showOrigin();
      child.once('closed', () => { children.delete(child); if (!children.size) accountWindows.delete(appInfo.id); });
      child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      child.webContents.on('will-navigate', (request, url) => { if (!isSafeHttpsUrl(url)) request.preventDefault(); });
      child.webContents.on('will-redirect', (request, url) => { if (!isSafeHttpsUrl(url)) request.preventDefault(); });
    });
    remote.on('will-navigate', (event, url) => {
      if (!isSafeHttpsUrl(url)) { event.preventDefault(); report('failed', appInfo.url, 'blocked'); }
    });
    remote.on('will-redirect', (event, url) => {
      if (!isSafeHttpsUrl(url)) { event.preventDefault(); report('failed', appInfo.url, 'blocked'); }
    });
    void remote.loadURL(appInfo.url).catch(() => { /* did-fail-load reports a safe, actionable error. */ });
  }
  return view;
}
function syncNotificationViews(): void {
  for (const service of data.apps) {
    if (notificationAllowed(service, 'notifications', service.url)) ensureView(service);
  }
}
function redrawView(): void {
  if (!win || !shellView) return;
  detachViews();
  const appInfo = selectedApp();
  if (!appInfo || overlayOpen) return;
  const view = ensureView(appInfo);
  if (appStates.get(appInfo.id)?.status === 'failed') return;
  const size = shellView.getBounds();
  const safeBounds = validBounds(bounds, size.width, size.height)
    ? bounds : { x: 0, y: 0, width: 0, height: 0 };
  view.setBounds(safeBounds);
  win.contentView.addChildView(view);
}
function isSafeHttpsUrl(url: string): boolean {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password; }
  catch { return false; }
}
const testNotifications = new Map<string, DesktopNotification>();
async function closeView(id: string): Promise<void> {
  await persistentNotifications.closeApp(id);
  testNotifications.get(id)?.close();
  testNotifications.delete(id);
  const view = views.get(id);
  if (!view) return;
  if (win) {
    try { win.contentView.removeChildView(view); } catch { /* already detached */ }
  }
  for (const child of accountWindows.get(id) ?? []) child.destroy();
  const peers = [...views].filter(([otherId, other]) => otherId !== id &&
    !other.webContents.isDestroyed() && other.webContents.session === view.webContents.session);
  const origin = notificationOrigin(appStates.get(id)?.url ?? view.webContents.getURL());
  const sameOrigin = peers.some(([otherId, other]) =>
    notificationOrigin(appStates.get(otherId)?.url ?? other.webContents.getURL()) === origin);
  try {
    if (!peers.length) await stopServiceWorkers(view.webContents);
    else if (origin && !sameOrigin) await stopServiceWorkers(view.webContents, [origin]);
  }
  finally {
    if (!view.webContents.isDestroyed()) view.webContents.close();
    views.delete(id);
    appStates.delete(id);
    shellView?.webContents.send('rokko:app-state', id, null);
  }
}
function setActive(id: string | null): AppSnapshot {
  if (id !== null && !dockApps(data, preferences).some(a => a.id === id)) {
    throw new Error('App not found in selected workspace');
  }
  const service = data.apps.find(a => a.id === id);
  if (service?.workspaceId && service.workspaceId !== data.selectedWorkspaceId) {
    const next = { ...data, selectedWorkspaceId: service.workspaceId }; saveData(next); data = next;
  }
  activeAppId = id;
  redrawView();
  return snapshot();
}
async function commitRegistry(next: AppData, invalidate?: string | string[]): Promise<AppSnapshot> {
  saveData(next);
  data = next;
  if (invalidate) await Promise.all((Array.isArray(invalidate) ? invalidate : [invalidate]).map(closeView));
  syncNotificationViews();
  if (!dockApps(data, preferences).some(item => item.id === activeAppId)) activeAppId = null;
  redrawView();
  return snapshot();
}
const serviceIcons = new Map<string, Promise<string | null>>();
function reloadService(id: string | null): void {
  if (!id) return;
  const state = appStates.get(id);
  if (state) updateAppState(id, { ...state, status: 'loading', error: undefined });
  views.get(id)?.webContents.reload();
}
const iconQueue: Array<() => void> = [];
let activeIconRequests = 0;
function loadServiceIcon(site: string, hints: string[] = []): Promise<string | null> {
  const origin = new URL(site).origin;
  const cached = serviceIcons.get(origin);
  if (cached) return cached;
  if (serviceIcons.size >= 128) serviceIcons.delete(serviceIcons.keys().next().value!);
  const result = new Promise<string | null>(resolve => {
    const start = (): void => {
      activeIconRequests++;
      const declared = serviceCatalog.templates.find(item => new URL(item.url).origin === origin)?.faviconUrl;
      void fetchFavicon(site, fetch, hints.length ? hints : declared ? [declared] : []).catch(() => null).then(resolve).finally(() => {
        activeIconRequests--; iconQueue.shift()?.();
      });
    };
    if (activeIconRequests < 3) start(); else iconQueue.push(start);
  }).then(icon => { if (!icon && serviceIcons.get(origin) === result) serviceIcons.delete(origin); return icon; });
  serviceIcons.set(origin, result);
  return result;
}
function registerIpc(): void {
  let contextMenu: Menu | null = null;
  ipcMain.handle('rokko:context-menu', (event, input: unknown) => {
    requireShell(event);
    const items = contextMenuItems(data, input, preferences.language, [...views.keys()], preferences.hiddenWorkspaces);
    const id = (input as { id: string }).id;
    if (!win) return null;
    contextMenu?.closePopup(win);
    return new Promise<ContextMenuAction | null>(resolve => {
      const menu = Menu.buildFromTemplate(items.map(item => ({ id: item.action, label: item.label,
        enabled: item.enabled, click: () => {
          try { contextMenuItems(data, input, preferences.language, [...views.keys()], preferences.hiddenWorkspaces); } catch { resolve(null); return; }
          if (item.action === 'reload') reloadService(id);
          resolve(item.action);
        } })));
      contextMenu = menu;
      menu.popup({ window: win!, callback: () => { if (contextMenu === menu) contextMenu = null; resolve(null); } });
    });
  });
  ipcMain.handle('rokko:preferences', (event, input: unknown) => {
    requireShell(event);
    const next = validatePreferences(input);
    const ids = new Set(['global', ...data.workspaces.map(w => w.id)]);
    if ([...next.cardOrder, ...next.hiddenWorkspaces].some(id => !ids.has(id))) throw new Error('Invalid layout');
    savePreferences(next);
    if (!dockApps(data, preferences).some(a => a.id === activeAppId)) activeAppId = null;
    redrawView(); return snapshot();
  });
  ipcMain.handle('rokko:move-app', (event, id: unknown, target: unknown, after: unknown) => {
    requireShell(event); return commitRegistry(moveApp(data, id, target, after));
  });
  ipcMain.handle('rokko:restart', event => { requireShell(event); app.relaunch(); app.quit(); });
  let readingRambox = false;
  ipcMain.handle('rokko:rambox-read', async (event, port: unknown, token: unknown) => {
    requireShell(event);
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1024 || port > 65535 ||
        typeof token !== 'string' || !token || token.length > 1024 || /[\r\n]/.test(token)) {
      throw new Error('Enter the local Rambox port and temporary token');
    }
    if (readingRambox) throw new Error('A Rambox read is already in progress');
    readingRambox = true;
    try { return parseRamboxMetadata(await readMetadata({ endpoint: `http://127.0.0.1:${port}/mcp`, token })); }
    catch { throw new Error('Could not read services. Check Rambox MCP settings and try again.'); }
    finally { readingRambox = false; }
  });
  ipcMain.handle('rokko:rambox-import', (event, input: unknown) => {
    requireShell(event);
    return commitRegistry(planRamboxImport(data, input, randomUUID));
  });
  ipcMain.handle('rokko:snapshot', event => { requireShell(event); return snapshot(); });
  ipcMain.handle('rokko:add-app', (event, input: unknown) => {
    requireShell(event);
    const { shareWorkspaceSession = false, ...fields } = appInput(data, input);
    if (data.apps.length >= 100) throw new Error('Maximum number of apps reached');
    const id = randomUUID();
    const next = { ...data, apps: [...data.apps, { id, ...fields, partition: servicePartition(id, fields.workspaceId, shareWorkspaceSession) }],
      selectedWorkspaceId: fields.workspaceId ?? data.selectedWorkspaceId };
    saveData(next);
    data = next;
    if (fields.workspaceId && preferences.hiddenWorkspaces.includes(fields.workspaceId)) {
      savePreferences({ ...preferences, hiddenWorkspaces: preferences.hiddenWorkspaces.filter(id => id !== fields.workspaceId) });
    }
    return setActive(id);
  });
  ipcMain.handle('rokko:add-workspace', (event, name: unknown) => {
    requireShell(event);
    if (data.workspaces.length >= 30) throw new Error('Maximum number of workspaces reached');
    const id = randomUUID();
    data.workspaces.push({ id, name: validTitle(name) });
    data.selectedWorkspaceId = id;
    activeAppId = null;
    saveData(); redrawView();
    return snapshot();
  });
  ipcMain.handle('rokko:select-workspace', (event, id: unknown) => {
    requireShell(event);
    if (typeof id !== 'string' || !data.workspaces.some(w => w.id === id)) throw new Error('Unknown workspace');
    data.selectedWorkspaceId = id;
    if (selectedApp()?.workspaceId !== null) activeAppId = null;
    saveData(); redrawView(); return snapshot();
  });
  ipcMain.handle('rokko:select-app', (event, id: unknown) => {
    requireShell(event);
    if (id !== null && typeof id !== 'string') throw new Error('Invalid app');
    return setActive(id);
  });
  ipcMain.handle('rokko:remove-app', async (event, id: unknown) => {
    requireShell(event);
    if (typeof id !== 'string' || !data.apps.some(a => a.id === id)) throw new Error('Unknown app');
    const next = { ...data, apps: data.apps.filter(a => a.id !== id) };
    saveData(next);
    data = next;
    if (activeAppId === id) activeAppId = null;
    await closeView(id);
    persistentNotifications.unregister(id);
    redrawView(); return snapshot();
  });
  ipcMain.handle('rokko:update-app', (event, id: unknown, input: unknown) => {
    requireShell(event);
    const next = updateApp(data, id, input);
    const previous = data.apps.find(item => item.id === id);
    const changed = next.apps.find(item => item.id === id);
    return commitRegistry(next, previous?.partition !== changed?.partition || previous?.url !== changed?.url || previous?.notificationOrigin !== changed?.notificationOrigin
      ? previous?.id : undefined);
  });
  ipcMain.handle('rokko:rename-workspace', (event, id: unknown, name: unknown) => {
    requireShell(event); return commitRegistry(renameWorkspace(data, id, name));
  });
  ipcMain.handle('rokko:remove-workspace', (event, id: unknown, destination: unknown) => {
    requireShell(event);
    const next = removeWorkspace(data, id, destination);
    const changed = next.apps.filter(item => data.apps.find(old => old.id === item.id)?.partition !== item.partition);
    return commitRegistry(next, changed.map(item => item.id));
  });
  ipcMain.handle('rokko:reorder-app', (event, id: unknown, direction: unknown) => {
    requireShell(event); return commitRegistry(reorderApp(data, id, direction));
  });
  ipcMain.handle('rokko:test-notification', (event, id: unknown) => {
    requireShell(event);
    const service = data.apps.find(item => item.id === id);
    if (!service || !notificationAllowed(service, 'notifications', service.url)) throw new Error('Enable and save notifications first');
    if (!DesktopNotification.isSupported()) throw new Error('Desktop notifications are not available');
    testNotifications.get(service.id)?.close();
    const notification = new DesktopNotification({ title: `Rokko · ${service.name}`,
      body: preferences.language === 'it' ? 'Le notifiche sono abilitate per questo servizio.' : 'Notifications are enabled for this service.', icon: appIcon });
    testNotifications.set(service.id, notification);
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        notification.close(); testNotifications.delete(service.id); reject(new Error('Desktop notification did not respond'));
      }, 5000);
      notification.once('show', () => { clearTimeout(timer); resolve(); });
      notification.once('failed', () => {
        clearTimeout(timer); testNotifications.delete(service.id); reject(new Error('Desktop notification failed'));
      });
      notification.once('close', () => { if (testNotifications.get(service.id) === notification) testNotifications.delete(service.id); });
      notification.show();
    });
  });
  ipcMain.handle('rokko:service-icon', (event, input: unknown) => {
    requireShell(event);
    const url = normalizeHttpsUrl(input);
    if (!data.apps.some(item => item.url === url) && !serviceCatalog.templates.some(item => item.url === url)) {
      throw new Error('Unknown service');
    }
    return loadServiceIcon(url);
  });
  ipcMain.on('rokko:overlay' , (event, open: unknown) => {
    requireShell(event);
    if (typeof open !== 'boolean') return;
    overlayOpen = open;
    redrawView();
  });
  ipcMain.on('rokko:bounds', (event, value: unknown) => {
    requireShell(event);
    if (!win) return;
    const { width, height } = shellView!.getBounds();
    if (!validBounds(value, width, height)) return;
    bounds = value as ViewBounds;
    const view = activeAppId ? views.get(activeAppId) : undefined;
    if (view) view.setBounds(bounds);
  });
  ipcMain.handle('rokko:back', event => {
    requireShell(event);
    const wc = activeAppId ? views.get(activeAppId)?.webContents : undefined;
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  });
  ipcMain.handle('rokko:forward', event => {
    requireShell(event);
    const wc = activeAppId ? views.get(activeAppId)?.webContents : undefined;
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  });
  ipcMain.handle('rokko:reload', event => {
    requireShell(event);
    reloadService(activeAppId);
  });
  ipcMain.handle('rokko:external', (event, url: unknown) => {
    requireShell(event);
    if (typeof url !== 'string' || !isSafeHttpsUrl(url)) throw new Error('Invalid external URL');
    return shell.openExternal(url);
  });
}
async function createWindow(): Promise<void> {
  win = new BaseWindow({ width: 1250, height: 820, minWidth: 820, minHeight: 560,
    title: 'Rokko', icon: appIcon, backgroundColor: '#0b1426' });
  shellView = new WebContentsView({ webPreferences: {
    preload: join(import.meta.dirname, '../preload/index.cjs'),
    nodeIntegration: false, contextIsolation: true, sandbox: true
  } });
  installNavigation(shellView.webContents);
  win.contentView.addChildView(shellView);
  shellView.webContents.on('will-navigate', event => event.preventDefault());
  shellView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const resizeShell = (): void => {
    if (!win || !shellView) return;
    const { width, height } = win.contentView.getBounds();
    shellView.setBounds({ x: 0, y: 0, width, height });
    redrawView();
  };
  win.on('resize', resizeShell);
  win.on('closed', () => {
    for (const id of [...views.keys()]) void closeView(id).catch(() => { /* App shutdown closes all processes. */ });
    shellView?.webContents.close();
    shellView = null; win = null;
  });
  resizeShell();
  if (process.env.ELECTRON_RENDERER_URL) await shellView.webContents.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await shellView.webContents.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  win.show();
  setImmediate(syncNotificationViews);
}
app.whenReady().then(async () => {
  loadData();
  persistentNotifications = new PersistentNotifications({
    app: id => data.apps.find(service => service.id === id),
    view: id => views.get(id)?.webContents,
    icon: appIcon,
    activate: id => {
      const service = data.apps.find(service => service.id === id);
      if (!service) return;
      if (service.workspaceId !== null) data.selectedWorkspaceId = service.workspaceId;
      if (service.workspaceId && preferences.hiddenWorkspaces.includes(service.workspaceId)) {
        savePreferences({ ...preferences, hiddenWorkspaces: preferences.hiddenWorkspaces.filter(id => id !== service.workspaceId) });
      }
      overlayOpen = false;
      saveData(); setActive(id);
      win?.show(); win?.focus();
      shellView?.webContents.send('rokko:snapshot-changed', snapshot());
    }
  });
  registerIpc(); await createWindow();
}).catch(console.error);
app.on('window-all-closed', () => app.quit());
