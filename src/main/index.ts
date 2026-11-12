import { app, BaseWindow, ipcMain, WebContentsView, session, shell, Notification as DesktopNotification } from 'electron';
import appIcon from '../renderer/src/assets/brand/rokko-dark-icon.png?asset';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { AppData, AppSnapshot, AppLoadState, ViewBounds, WebApp } from '../shared/model';
import { notificationAllowed, validNotificationGrant } from '../shared/notifications.mjs';
import { serviceCatalog } from '../shared/service-catalog.mjs';
import { fetchFavicon, validIcon } from '../shared/service-icons.mjs';
import { appInput, updateApp, renameWorkspace, removeWorkspace, reorderApp } from '../shared/registry.mjs';
import { normalizeHttpsUrl, validTitle, validBounds } from '../shared/validation.mjs';
import { stopServiceWorkers } from './worker-lifecycle.mjs';
import { PersistentNotifications } from './persistent-notifications';

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
      typeof a?.url === 'string' && typeof a?.workspaceId === 'string' &&
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
function snapshot(): AppSnapshot { return { data, activeAppId, appStates: Object.fromEntries(appStates) }; }
function updateAppState(id: string, state: AppLoadState): void {
  if (!views.has(id)) return;
  const previous = appStates.get(id);
  appStates.set(id, state);
  shellView?.webContents.send('rokko:app-state', id, state);
  if (id === activeAppId && (previous?.status === 'failed' || state.status === 'failed')) redrawView();
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
    persistentNotifications.configure(appInfo, partitionSession);
    partitionSession.setPermissionRequestHandler((requester, permission, callback, details) => {
      const owner = views.get(appInfo.id)?.webContents;
      callback((!requester || requester === owner) && notificationAllowed(
        data.apps.find(item => item.id === appInfo.id), permission, details.requestingUrl));
    });
    partitionSession.setPermissionCheckHandler((requester, permission, origin) => {
      const owner = views.get(appInfo.id)?.webContents;
      return (!requester || requester === owner) && notificationAllowed(
        data.apps.find(item => item.id === appInfo.id), permission, origin);
    });
    view = new WebContentsView({ webPreferences: {
      session: partitionSession, nodeIntegration: false, contextIsolation: true, sandbox: true
    } });
    const remote = view.webContents;
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
      if (isSafeHttpsUrl(url)) void shell.openExternal(url);
      return { action: 'deny' };
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
  const size = win.getContentBounds();
  const safeBounds = validBounds(bounds, size.width, size.height)
    ? bounds : { x: 238, y: 106, width: Math.max(0, size.width - 238), height: Math.max(0, size.height - 136) };
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
  try { await stopServiceWorkers(view.webContents); }
  finally {
    if (!view.webContents.isDestroyed()) view.webContents.close();
    views.delete(id);
    appStates.delete(id);
    shellView?.webContents.send('rokko:app-state', id, null);
  }
}
function setActive(id: string | null): AppSnapshot {
  if (id !== null && !data.apps.some(a => a.id === id && a.workspaceId === data.selectedWorkspaceId)) {
    throw new Error('App not found in selected workspace');
  }
  activeAppId = id;
  redrawView();
  return snapshot();
}
async function commitRegistry(next: AppData, invalidate?: string): Promise<AppSnapshot> {
  saveData(next);
  data = next;
  if (invalidate) await closeView(invalidate);
  syncNotificationViews();
  if (!data.apps.some(item => item.id === activeAppId && item.workspaceId === data.selectedWorkspaceId)) activeAppId = null;
  redrawView();
  return snapshot();
}
const serviceIcons = new Map<string, Promise<string | null>>();
function registerIpc(): void {
  ipcMain.handle('rokko:snapshot', event => { requireShell(event); return snapshot(); });
  ipcMain.handle('rokko:add-app', (event, input: unknown) => {
    requireShell(event);
    const fields = appInput(data, input);
    if (data.apps.length >= 100) throw new Error('Maximum number of apps reached');
    const id = randomUUID();
    const next = { ...data, apps: [...data.apps, { id, ...fields, partition: `persist:rokko-${id}` }],
      selectedWorkspaceId: fields.workspaceId };
    saveData(next);
    data = next;
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
    data.selectedWorkspaceId = id; activeAppId = null;
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
    return commitRegistry(next, previous?.url !== changed?.url || previous?.notificationOrigin !== changed?.notificationOrigin
      ? previous?.id : undefined);
  });
  ipcMain.handle('rokko:rename-workspace', (event, id: unknown, name: unknown) => {
    requireShell(event); return commitRegistry(renameWorkspace(data, id, name));
  });
  ipcMain.handle('rokko:remove-workspace', (event, id: unknown, destination: unknown) => {
    requireShell(event); return commitRegistry(removeWorkspace(data, id, destination));
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
      body: 'Notifications are enabled for this service.', icon: appIcon });
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
    const origin = new URL(url).origin;
    if (!serviceIcons.has(origin)) {
      if (serviceIcons.size >= 128) serviceIcons.delete(serviceIcons.keys().next().value!);
      serviceIcons.set(origin, fetchFavicon(url).catch(() => null));
    }
    return serviceIcons.get(origin);
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
    const { width, height } = win.getContentBounds();
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
    if (activeAppId) {
      const state = appStates.get(activeAppId);
      if (state) updateAppState(activeAppId, { ...state, status: 'loading', error: undefined });
      views.get(activeAppId)?.webContents.reload();
    }
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
  win.contentView.addChildView(shellView);
  shellView.webContents.on('will-navigate', event => event.preventDefault());
  shellView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const resizeShell = (): void => {
    if (!win || !shellView) return;
    const { width, height } = win.getContentBounds();
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
      data.selectedWorkspaceId = service.workspaceId;
      overlayOpen = false;
      saveData(); setActive(id);
      win?.show(); win?.focus();
      shellView?.webContents.send('rokko:snapshot-changed', snapshot());
    }
  });
  registerIpc(); await createWindow();
}).catch(console.error);
app.on('window-all-closed', () => app.quit());
