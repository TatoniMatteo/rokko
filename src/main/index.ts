import { splitBounds } from './lifecycle/split-bounds.mjs';
import { exportConfiguration, planConfigurationImport } from '../shared/import/configuration.mjs';
import { readConfiguration, writeConfiguration } from './import/configuration-file.mjs';
import { externalLink } from '../shared/security/external-links.mjs';
import { MediaPermissions } from './permissions/media-permissions';
import { Downloads } from './downloads/downloads';
import { LocalLog, diagnosticReport, exportDiagnostics } from './diagnostics/local-log.mjs';
import { app, Menu, BaseWindow, ipcMain, WebContentsView, session, shell, Notification as DesktopNotification, dialog, powerMonitor } from 'electron';
import { nativeViewBounds } from './lifecycle/view-bounds.mjs';
import { restoreWindow, createTray } from './lifecycle/desktop';
import { isShellSender } from './security/shell-sender.mjs';
import appIcon from '../../assets/brand/rokko-dark-icon.png?asset';
import { randomUUID } from 'node:crypto';
import { ProfileStore, emptyProfile, recoveryInfo, recoverProfile } from './storage/profile-store.mjs';
import type { RecoveryKind } from './storage/profile-store.mjs';
import { join } from 'node:path';
import type { ContextMenuAction, AppData, AppSnapshot, AppLoadState, ViewBounds, WebApp } from '../shared/contracts/model';
import { notificationAllowed, notificationOrigin } from '../shared/notifications/notifications.mjs';
import { serviceCatalog } from '../shared/services/service-catalog.mjs';
import { fetchFavicon } from '../shared/services/service-icons.mjs';
import { appInput, updateApp, renameWorkspace, removeWorkspace, reorderApp } from '../shared/apps/registry.mjs';
import { normalizeHttpsUrl, validTitle, validBounds } from '../shared/security/validation.mjs';
import { stopServiceWorkers } from './lifecycle/worker-lifecycle.mjs';
import { PersistentNotifications } from './notifications/persistent-notifications';
import { sharesWorkspace, servicePartition } from '../shared/apps/sessions.mjs';
import { shortcutTarget } from './navigation/shortcuts.mjs';
import { serviceUserAgent } from './navigation/user-agent.mjs';
import { contextMenuItems } from './navigation/context-menu.mjs';
import { readMetadata } from './import/rambox-mcp.mjs';
import { parseRamboxMetadata, planRamboxImport } from '../shared/import/rambox.mjs';

import { validatePreferences, dockApps, moveApp, languageList } from '../shared/preferences/preferences.mjs';

const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
if (process.platform === 'linux') app.setDesktopName('rokko.desktop');

const profileDirectory = app.getPath('userData');
const diagnostics = new LocalLog(profileDirectory);
if (primaryInstance) diagnostics.record('startup');
let profileStore: ProfileStore | undefined;
let recovery: ReturnType<typeof recoveryInfo> | undefined;
let initial = emptyProfile();
try {
  if (primaryInstance) { profileStore = new ProfileStore(profileDirectory); initial = profileStore.read(); }
} catch (error) {
  const kind = (error as { kind?: RecoveryKind }).kind ?? 'corrupt';
  recovery = recoveryInfo(profileDirectory, kind);
}
let preferences = initial.preferences;
let data: AppData = initial.data;
let profileNotices = initial.notices;
const browserLanguage = preferences.language;
app.commandLine.appendSwitch('lang', browserLanguage === 'it' ? 'it-IT' : 'en-US');
function activeStore(): ProfileStore {
  if (!profileStore) throw new Error('Recover the configuration before continuing');
  return profileStore;
}
function savePreferences(next: typeof preferences): void {
  try { activeStore().savePreferences(next); preferences = next; }
  catch { throw new Error('Could not save configuration. Your previous data is unchanged.'); }
}
let win: BaseWindow | null = null;
let shellView: WebContentsView | null = null;
let tray: ReturnType<typeof createTray> | undefined;
let quitting = false;
let shutdown: Promise<void> | undefined;
const closingViews = new Map<string, Promise<void>>();
app.on('second-instance', () => restoreWindow(win));
app.on('activate', () => restoreWindow(win));
const views = new Map<string, WebContentsView>();
const suspended = new Set<string>();
const appStates = new Map<string, AppLoadState>();
let activeAppId: string | null = initial.activeAppId;
let overlayOpen = false;
let previewRatio: number | undefined;
let bounds: ViewBounds = { x: 238, y: 106, width: 942, height: 550 };
let persistentNotifications: PersistentNotifications;
const permissionSessions = new WeakSet<Electron.Session>();
const accountWindows = new Map<string, Set<Electron.BrowserWindow>>();
const downloads = new Downloads(contents => [...views].find(([,view]) => view.webContents === contents)?.[0], () => {if(shellView&&!shellView.webContents.isDestroyed())shellView.webContents.send('rokko:downloads-changed',downloads.list());}, event => diagnostics.record(event));

const mediaPermissions = new MediaPermissions(contents => {const entry=[...views].find(([,view]) => view.webContents === contents);return entry?{id:entry[0],active:Boolean(win?.contentView.children.includes(entry[1]))&&!overlayOpen&&!suspended.has(entry[0])}:undefined;}, () => {if(shellView&&!shellView.webContents.isDestroyed())shellView.webContents.send('rokko:permissions-changed',mediaPermissions.list());}, event => diagnostics.record(event));

function saveData(value: AppData = data): void {
  try { preferences = activeStore().saveData(value, activeAppId).preferences; }
  catch { throw new Error('Could not save configuration. Your previous data is unchanged.'); }
}
let contextTimer: ReturnType<typeof setTimeout> | undefined;
function flushContext(): void {
  clearTimeout(contextTimer);
  if (!profileStore) return;
  profileStore.saveContext(data.selectedWorkspaceId, activeAppId);
}
function scheduleContext(): void {
  clearTimeout(contextTimer);
  contextTimer = setTimeout(() => {
    try { flushContext(); }
    catch { profileNotices = ['Could not save the last workspace. Your services are unchanged.']; shellView?.webContents.send('rokko:snapshot-changed', snapshot()); }
  }, 150);
}
function snapshot(): AppSnapshot { return { data, activeAppId, loadedIds:[...views.keys()], suspendedIds:[...suspended], permissionState:mediaPermissions.list(), appStates: Object.fromEntries(appStates), preferences, browserLanguage, recovery, profileNotices }; }
function updateAppState(id: string, state: AppLoadState): void {
  if (!views.has(id)) return;
  const previous = appStates.get(id);
  appStates.set(id, state);
  shellView?.webContents.send('rokko:app-state', id, state);
  if ((id === activeAppId || id === preferences.split.secondaryId) && (previous?.status === 'failed' || state.status === 'failed')) redrawView();
}
function installNavigation(contents: Electron.WebContents): void {
  contents.on('before-input-event', (event, input) => {
    if (shutdown || !shellView || (contents !== shellView.webContents &&
        contents !== (activeAppId ? views.get(activeAppId)?.webContents : undefined) &&
        contents !== (preferences.split.secondaryId ? views.get(preferences.split.secondaryId)?.webContents : undefined))) return;
    if (input.type === 'keyDown' && input.control && !input.alt && !input.meta && !input.shift &&
        !input.isComposing && !input.isAutoRepeat && input.key.toLowerCase() === 'k') {
      event.preventDefault();
      shellView.webContents.focus();
      shellView.webContents.send('rokko:quick-switch');
      return;
    }
    const target = shortcutTarget(data, activeAppId, input, overlayOpen, preferences);
    if (!target) return;
    event.preventDefault();
    try {
      if (target.workspaceId !== data.selectedWorkspaceId) {
        const next = { ...data, selectedWorkspaceId: target.workspaceId };
        data = next;
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
  if (!isShellSender(event, shellView?.webContents)) throw new Error('Unauthorized renderer');
  if (shutdown) throw new Error('Rokko is closing');
}
function selectedApp(): WebApp | undefined { return data.apps.find(a => a.id === activeAppId); }
function detachViews(): void {
  if (!win) return;
  for (const view of views.values()) {
    try { win.contentView.removeChildView(view); } catch { /* not attached */ }
  }
}
function ensureView(appInfo: WebApp): WebContentsView {
  if (suspended.has(appInfo.id)) throw new Error('Resume the service first.');
  let view = views.get(appInfo.id);
  if (!view) {
    const partitionSession = session.fromPartition(appInfo.partition);
    partitionSession.setUserAgent(partitionSession.getUserAgent(), languageList(browserLanguage));
    persistentNotifications.configure(appInfo, partitionSession);
    downloads.configure(partitionSession);
    if (!permissionSessions.has(partitionSession)) {
      permissionSessions.add(partitionSession);
      const allowed = (requester: Electron.WebContents | null, permission: string, origin: string): boolean =>
        data.apps.some(item => item.partition === appInfo.partition &&
          (!requester || views.get(item.id)?.webContents === requester) && notificationAllowed(item, permission, origin));
      mediaPermissions.configure(partitionSession);
      partitionSession.setPermissionRequestHandler((requester, permission, callback, details) => {
        if (permission === 'notifications') callback(allowed(requester, permission, details.requestingUrl));
        else mediaPermissions.request(requester,permission,callback,details);
      });
      partitionSession.setPermissionCheckHandler((requester, permission, origin, details) => permission === 'notifications' ? allowed(requester, permission, origin) : mediaPermissions.check(requester,permission,origin,details));
    }
    view = new WebContentsView({ webPreferences: {
      session: partitionSession, nodeIntegration: false, contextIsolation: true, sandbox: true
    } });
    view.setBorderRadius(0);
    const remote = view.webContents;
    remote.setAudioMuted(preferences.mutedServices.includes(appInfo.id));
    remote.setUserAgent(serviceUserAgent(appInfo.url, partitionSession.getUserAgent()));
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
    remote.on('render-process-gone', (_event, details) => {
      if (details.reason !== 'clean-exit') { diagnostics.record('renderer-crashed'); report('failed', undefined, 'crashed'); }
    });
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
      if (mainFrame && code !== -3) { diagnostics.record('load-failed', {code}); report('failed', url, code); }
    });
    remote.on('did-finish-load', () => {
      if (appStates.get(appInfo.id)?.status !== 'failed') report('ready', remote.getURL());
    });
    remote.on('did-stop-loading', () => {
      if (appStates.get(appInfo.id)?.status === 'loading') report('ready', remote.getURL());
    });
    remote.on('did-navigate', (_event, url) => {
      mediaPermissions.navigated(appInfo.id,url);
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
      void externalFromService(remote,url);
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
      if (!isSafeHttpsUrl(url)) { event.preventDefault(); if (externalLink(url)) void externalFromService(remote,url); else report('failed', appInfo.url, 'blocked'); }
    });
    remote.on('will-redirect', (event, url) => {
      if (!isSafeHttpsUrl(url)) { event.preventDefault(); report('failed', appInfo.url, 'blocked'); }
    });
    void remote.loadURL(appInfo.url).catch(() => { /* did-fail-load reports a safe, actionable error. */ });
  }
  return view;
}
function syncNotificationViews(): void {
  if (shutdown) return;
  for (const service of data.apps) {
    if (!suspended.has(service.id) && notificationAllowed(service, 'notifications', service.url)) ensureView(service);
  }
}
function redrawView(): void {
  if (shutdown || !win || !shellView) return;
  detachViews();
  const primary = selectedApp();
  if (!primary || overlayOpen) return;
  const secondary = data.apps.find(service => service.id === preferences.split.secondaryId && service.id !== primary.id && dockApps(data,preferences).some(item=>item.id===service.id));
  const size = shellView.getBounds();
  const safeBounds = validBounds(bounds, size.width, size.height) ? bounds : {x:0,y:0,width:0,height:0};
  const rectangles = secondary ? splitBounds(safeBounds,previewRatio ?? preferences.split.ratio,Math.round(8*shellView.webContents.getZoomFactor())) : [safeBounds];
  for (const [index,service] of [primary,secondary].entries()) {
    if (!service || suspended.has(service.id)) continue;
    const view = ensureView(service);
    if (appStates.get(service.id)?.status === 'failed') continue;
    view.setBounds(rectangles[index]);
    win.contentView.addChildView(view);
  }
}
const externalPrompts = new Set<Electron.WebContents>();
async function externalFromService(contents:Electron.WebContents,url:string):Promise<void> {
  const destination=externalLink(url);
  if(!destination||shutdown||contents.isDestroyed()||externalPrompts.has(contents)||![...views.values()].some(view=>view.webContents===contents))return;
  externalPrompts.add(contents);
  try {
    const italian=preferences.language==='it';
    const result=await dialog.showMessageBox({type:'question',message:italian?'Aprire questo collegamento fuori da Rokko?':'Open this link outside Rokko?',detail:destination.label,buttons:italian?['Annulla','Apri']:['Cancel','Open'],defaultId:0,cancelId:0,noLink:true});
    if(result.response===1&&!shutdown&&!contents.isDestroyed()&&[...views.values()].some(view=>view.webContents===contents))await shell.openExternal(destination.url);
  }catch{/* A missing desktop handler leaves the service intact. */}finally{externalPrompts.delete(contents);}
}
function isSafeHttpsUrl(url: string): boolean {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password; }
  catch { return false; }
}
const testNotifications = new Map<string, DesktopNotification>();
function closeView(id: string): Promise<void> {
  const pending = closingViews.get(id);
  if (pending) return pending;
  const task = disposeView(id).finally(() => closingViews.delete(id));
  closingViews.set(id, task);
  return task;
}
async function disposeView(id: string): Promise<void> {
  mediaPermissions.closeApp(id);
  downloads.closeService(id);
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const cleanup = !peers.length ? stopServiceWorkers(view.webContents)
      : origin && !sameOrigin ? stopServiceWorkers(view.webContents, [origin]) : Promise.resolve();
    await Promise.race([cleanup, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Service cleanup timed out')), 5000);
    })]);
  }
  finally {
    clearTimeout(timer);
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
    const next = { ...data, selectedWorkspaceId: service.workspaceId }; data = next;
  }
  if (id && preferences.split.secondaryId === id) savePreferences({...preferences,split:{...preferences.split,secondaryId:null}});
  activeAppId = id;
  scheduleContext();
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
  if (!id || suspended.has(id)) return;
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
  ipcMain.handle('rokko:split', (event,id:unknown,ratio:unknown) => {
    requireShell(event);
    if (id !== null && (typeof id !== 'string' || id === activeAppId || !dockApps(data,preferences).some(service=>service.id===id))) throw new Error('Choose a different visible service.');
    savePreferences(validatePreferences({...preferences,split:{secondaryId:id,ratio}}));
    previewRatio=undefined; redrawView(); return snapshot();
  });
  ipcMain.on('rokko:split-ratio', (event,ratio:unknown) => {
    if (!isShellSender(event,shellView?.webContents) || shutdown || typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0.25 || ratio > 0.75) return;
    previewRatio=ratio;redrawView();
  });
  ipcMain.handle('rokko:service-control', async (event,id:unknown,action:unknown) => {
    requireShell(event);
    const service=data.apps.find(service=>service.id===id);
    if (!service || !['mute','unmute','reload','reset-permissions','clear-cache'].includes(action as string)) throw new Error('Invalid service action.');
    if (action === 'mute' || action === 'unmute') {
      savePreferences({...preferences,mutedServices:action === 'mute' ? [...new Set([...preferences.mutedServices,service.id])] : preferences.mutedServices.filter(id=>id!==service.id)});
      views.get(service.id)?.webContents.setAudioMuted(action === 'mute');
    } else if (action === 'reload') reloadService(service.id);
    else if (action === 'clear-cache') await session.fromPartition(service.partition).clearCache();
    else return commitRegistry(updateApp(data,service.id,{name:service.name,url:service.url,workspaceId:service.workspaceId,icon:service.icon,shareWorkspaceSession:sharesWorkspace(service),notificationOrigin:null}),service.id);
    return snapshot();
  });
  ipcMain.handle('rokko:configuration-export', async event => {
    requireShell(event);
    const document = exportConfiguration(data,preferences);
    const result = await dialog.showSaveDialog({title:preferences.language === 'it' ? 'Esporta configurazione' : 'Export configuration',defaultPath:'rokko-configuration.json',filters:[{name:'JSON',extensions:['json']}],properties:['showOverwriteConfirmation']});
    if (result.canceled || !result.filePath) return false;
    try {await writeConfiguration(result.filePath,document); return true;}
    catch {throw new Error('Could not export configuration.');}
  });
  ipcMain.handle('rokko:configuration-read', async event => {
    requireShell(event);
    const result = await dialog.showOpenDialog({properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});
    if (result.canceled || !result.filePaths[0]) return null;
    try {return await readConfiguration(result.filePaths[0]);}
    catch {throw new Error('Unsupported configuration file.');}
  });
  ipcMain.handle('rokko:configuration-import', (event,input:unknown,options:unknown) => {
    requireShell(event);
    const next = planConfigurationImport(data,preferences,input,options,randomUUID);
    const saved = activeStore().saveConfiguration(next.data,next.preferences);
    data=saved.data; preferences=saved.preferences;
    if (preferences.language !== browserLanguage) profileNotices=['Restart Rokko to apply the restored language to websites.'];
    tray?.refresh(); syncNotificationViews(); redrawView();
    return {...snapshot(),importSummary:{added:next.added,skipped:next.skipped}};
  });
  ipcMain.handle('rokko:focus-service', event => {
    requireShell(event);
    if (!overlayOpen && activeAppId && !suspended.has(activeAppId)) views.get(activeAppId)?.webContents.focus();
  });
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
    tray?.refresh();
    if (!dockApps(data, preferences).some(a => a.id === activeAppId)) activeAppId = null;
    redrawView(); return snapshot();
  });
  ipcMain.handle('rokko:move-app', (event, id: unknown, target: unknown, after: unknown) => {
    requireShell(event); return commitRegistry(moveApp(data, id, target, after));
  });
  ipcMain.handle('rokko:permission-response', (event,id:unknown,allow:unknown,source:unknown) => {requireShell(event);mediaPermissions.respond(id,allow,source);});
  ipcMain.handle('rokko:permission-revoke', async (event,id:unknown) => {requireShell(event);if(typeof id!=='string'||!data.apps.some(service=>service.id===id))throw new Error('Unknown service');await closeView(id);syncNotificationViews();redrawView();return snapshot();});
  ipcMain.handle('rokko:downloads', event => {requireShell(event);return downloads.list();});
  ipcMain.handle('rokko:cancel-download', (event,id:unknown) => {requireShell(event);downloads.cancel(id);});
  ipcMain.handle('rokko:suspend-service', async (event, id: unknown) => {
    requireShell(event);
    if (typeof id !== 'string' || !data.apps.some(service => service.id === id)) throw new Error('Unknown service');
    if (!suspended.has(id)) {
      suspended.add(id);
      await closeView(id).catch(() => { /* closeView always disposes the renderer. */ });
      diagnostics.record('service-suspended');
    }
    redrawView(); return snapshot();
  });
  ipcMain.handle('rokko:resume-service', async (event, id: unknown) => {
    requireShell(event);
    if (typeof id !== 'string' || !data.apps.some(service => service.id === id)) throw new Error('Unknown service');
    await closingViews.get(id);
    requireShell(event);
    if (!data.apps.some(service => service.id === id)) throw new Error('Unknown service');
    suspended.delete(id); diagnostics.record('service-resumed');
    syncNotificationViews(); redrawView(); return snapshot();
  });
  ipcMain.handle('rokko:recover-connections', event => { requireShell(event); scheduleReconnect(); });
  ipcMain.handle('rokko:export-diagnostics', async event => {
    requireShell(event);
    const result = await dialog.showSaveDialog({title: preferences.language === 'it' ? 'Esporta diagnostica' : 'Export diagnostics', defaultPath:'rokko-diagnostics.json',filters:[{name:'JSON',extensions:['json']}]});
    if (result.canceled || !result.filePath) return false;
    try {
      exportDiagnostics(result.filePath, diagnosticReport({versions:{app:app.getVersion(),electron:process.versions.electron,chrome:process.versions.chrome,node:process.versions.node},platform:process.platform,arch:process.arch,display:process.env.WAYLAND_DISPLAY ? 'wayland' : 'x11',counts:{services:data.apps.length,workspaces:data.workspaces.length,loaded:views.size,suspended:suspended.size}},diagnostics.read()));
      return true;
    } catch { throw new Error('Could not export diagnostics.'); }
  });
  ipcMain.handle('rokko:clear-diagnostics', event => {
    requireShell(event); try {diagnostics.clear();} catch {throw new Error('Could not clear diagnostics.');}
  });
  ipcMain.handle('rokko:restart', event => { requireShell(event); app.relaunch(); app.quit(); });
  ipcMain.handle('rokko:recover-profile', (event, action: unknown) => {
    requireShell(event);
    if (!recovery || (action !== 'restore' && action !== 'new')) throw new Error('Invalid recovery action');
    try { profileStore = recoverProfile(profileDirectory, action, recovery.kind); }
    catch (error) {
      if ((error as { kind?: string }).kind === 'future') {
        recovery = recoveryInfo(profileDirectory, 'future');
        shellView?.webContents.send('rokko:snapshot-changed', snapshot());
      }
      throw new Error('Could not complete recovery. Your previous files are preserved.');
    }
    const restored = profileStore.read();
    data = restored.data; preferences = restored.preferences; activeAppId = restored.activeAppId;
    profileNotices = restored.notices;
    if (browserLanguage !== preferences.language) profileNotices.push('Restart Rokko to apply the restored language to websites.');
    recovery = undefined;
    tray?.refresh(); syncNotificationViews(); redrawView();
    return snapshot();
  });
  ipcMain.handle('rokko:export-profile', async event => {
    requireShell(event);
    const store = activeStore();
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'],
      title: preferences.language === 'it' ? 'Esporta configurazione' : 'Export configuration' });
    if (result.canceled || !result.filePaths[0]) return false;
    try { flushContext(); store.exportLegacy(result.filePaths[0]); return true; }
    catch { throw new Error('Could not export the configuration. Your saved data is unchanged.'); }
  });
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
    const next = { ...data, workspaces: [...data.workspaces, { id, name: validTitle(name) }], selectedWorkspaceId: id };
    saveData(next); data = next; activeAppId = null;
    scheduleContext(); redrawView();
    return snapshot();
  });
  ipcMain.handle('rokko:select-workspace', (event, id: unknown) => {
    requireShell(event);
    if (typeof id !== 'string' || !data.workspaces.some(w => w.id === id)) throw new Error('Unknown workspace');
    data.selectedWorkspaceId = id;
    if (selectedApp()?.workspaceId !== null) activeAppId = null;
    scheduleContext(); redrawView(); return snapshot();
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
    suspended.delete(id);
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
    if (!isShellSender(event, shellView?.webContents)) return;
    if (typeof open !== 'boolean') return;
    overlayOpen = open;
    redrawView();
  });
  ipcMain.on('rokko:bounds', (event, value: unknown) => {
    if (!isShellSender(event, shellView?.webContents)) return;
    if (!win) return;
    const { width, height } = shellView!.getBounds();
    const next = nativeViewBounds(value, width, height, shellView!.webContents.getZoomFactor());
    if (!next) return;
    bounds = next;
    const view = activeAppId ? views.get(activeAppId) : undefined;
    if (view) redrawView();
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
    const destination=externalLink(url);
    if (!destination) throw new Error('Invalid external URL');
    return shell.openExternal(destination.url);
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
const reconnectTimers = new Set<ReturnType<typeof setTimeout>>();
let lastReconnect = 0;
function scheduleReconnect(): void {
  if (shutdown || Date.now()-lastReconnect < 5000) return;
  lastReconnect=Date.now();
  for (const timer of reconnectTimers) clearTimeout(timer);
  reconnectTimers.clear();
  for (const delay of [1000, 4000, 12000]) {
    const timer=setTimeout(() => {
      reconnectTimers.delete(timer);
      if (shutdown) return;
      for (const [id,state] of appStates) {
        if (!suspended.has(id) && state.status === 'failed' && typeof state.error === 'number' && [-2,-7,-101,-102,-105,-106,-118,-137].includes(state.error)) reloadService(id);
      }
    },delay);
    reconnectTimers.add(timer);
  }
}
if (primaryInstance) app.whenReady().then(async () => {
  persistentNotifications = new PersistentNotifications({
    app: id => data.apps.find(service => service.id === id),
    view: id => views.get(id)?.webContents,
    icon: appIcon,
    activate: id => {
      if (shutdown) return;
      const service = data.apps.find(service => service.id === id);
      if (!service) return;
      if (service.workspaceId !== null) data.selectedWorkspaceId = service.workspaceId;
      if (service.workspaceId && preferences.hiddenWorkspaces.includes(service.workspaceId)) {
        savePreferences({ ...preferences, hiddenWorkspaces: preferences.hiddenWorkspaces.filter(id => id !== service.workspaceId) });
      }
      overlayOpen = false;
      setActive(id);
      win?.show(); win?.focus();
      shellView?.webContents.send('rokko:snapshot-changed', snapshot());
    }
  });
  powerMonitor.on('resume', () => {diagnostics.record('system-resume'); scheduleReconnect();});
  registerIpc(); await createWindow();
  tray = createTray(appIcon, () => win, () => preferences.language);
}).catch(error => { console.error(error); app.quit(); });
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault();
  if (shutdown) return;
  tray?.destroy();
  mediaPermissions.close();
  downloads.close();
  for (const timer of reconnectTimers) clearTimeout(timer);
  reconnectTimers.clear();
  try { flushContext(); } catch { console.error('[Rokko] Could not save the last workspace.'); }
  shutdown = Promise.allSettled([...views.keys()].map(closeView)).then(() => {
    clearTimeout(contextTimer);
    profileStore?.close();
    quitting = true;
    app.quit();
  });
});
app.on('window-all-closed', () => app.quit());
