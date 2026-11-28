import { contextBridge, ipcRenderer } from 'electron';
import type { RokkoAPI, AppSnapshot, AppLoadState, ExternalLinkRequest } from '../shared/contracts/model';

const iconListeners = new Set<(url: string, icon: string) => void>();
const receiveIcon = (_event: Electron.IpcRendererEvent, url: string, icon: string): void => {
  for (const listener of iconListeners) listener(url, icon);
};
const api: RokkoAPI = {
  onLifecycle: callback => {
    const listener=(_event:Electron.IpcRendererEvent,state:import('../shared/contracts/model').ServiceLifecycle)=>callback(state);
    ipcRenderer.on('rokko:lifecycle-changed',listener);
    return ()=>{ipcRenderer.removeListener('rokko:lifecycle-changed',listener);};
  },
  setSplit: (id,ratio) => ipcRenderer.invoke('rokko:split',id,ratio),
  previewSplitRatio: ratio => ipcRenderer.send('rokko:split-ratio',ratio),
  controlService: (id,action) => ipcRenderer.invoke('rokko:service-control',id,action),
  exportConfiguration: () => ipcRenderer.invoke('rokko:configuration-export'),
  readConfiguration: () => ipcRenderer.invoke('rokko:configuration-read'),
  importConfiguration: (input,options) => ipcRenderer.invoke('rokko:configuration-import',input,options),
  onQuickSwitch: callback => {
    const listener = () => callback();
    ipcRenderer.on('rokko:quick-switch', listener);
    return () => {ipcRenderer.removeListener('rokko:quick-switch', listener);};
  },
  onExternalLinkRequests: callback => {
    const listener = (_event: Electron.IpcRendererEvent, requests: ExternalLinkRequest[]) => callback(requests);
    ipcRenderer.on('rokko:external-link-requests', listener);
    return () => { ipcRenderer.removeListener('rokko:external-link-requests', listener); };
  },
  resolveExternalLinkRequest: (id, action) => ipcRenderer.invoke('rokko:external-link-response', id, action),
  focusService: () => ipcRenderer.invoke('rokko:focus-service'),
  respondPermission: (id,allow,source) => ipcRenderer.invoke('rokko:permission-response',id,allow,source),
  revokePermissions: id => ipcRenderer.invoke('rokko:permission-revoke',id),
  onPermissions: callback => {
    const listener = (_event: Electron.IpcRendererEvent, state: import('../shared/contracts/model').PermissionState) => callback(state);
    ipcRenderer.on('rokko:permissions-changed',listener);
    return () => {ipcRenderer.removeListener('rokko:permissions-changed',listener);};
  },
  suspendService: id => ipcRenderer.invoke('rokko:suspend-service', id),
  resumeService: id => ipcRenderer.invoke('rokko:resume-service', id),
  getDownloads: () => ipcRenderer.invoke('rokko:downloads'),
  getResourceUsage: () => ipcRenderer.invoke('rokko:resource-usage'),
  cancelDownload: id => ipcRenderer.invoke('rokko:cancel-download',id),
  onDownloads: callback => {
    const listener = (_event: Electron.IpcRendererEvent, downloads: import('../shared/contracts/model').DownloadInfo[]) => callback(downloads);
    ipcRenderer.on('rokko:downloads-changed',listener);
    return () => {ipcRenderer.removeListener('rokko:downloads-changed',listener);};
  },
  recoverConnections: () => ipcRenderer.invoke('rokko:recover-connections'),
  exportDiagnostics: () => ipcRenderer.invoke('rokko:export-diagnostics'),
  clearDiagnostics: () => ipcRenderer.invoke('rokko:clear-diagnostics'),
  recoverProfile: action => ipcRenderer.invoke('rokko:recover-profile', action),
  exportProfile: () => ipcRenderer.invoke('rokko:export-profile'),
  onServiceIcon: callback => {
    iconListeners.add(callback);
    if (iconListeners.size === 1) ipcRenderer.on('rokko:service-icon-changed', receiveIcon);
    return () => {
      iconListeners.delete(callback);
      if (!iconListeners.size) ipcRenderer.removeListener('rokko:service-icon-changed', receiveIcon);
    };
  },
  showContextMenu: input => ipcRenderer.invoke('rokko:context-menu', input),
  setPreferences: input => ipcRenderer.invoke('rokko:preferences', input),
  moveApp: (id, targetId, after) => ipcRenderer.invoke('rokko:move-app', id, targetId, after),
  restart: () => ipcRenderer.invoke('rokko:restart'),
  readRambox: (port, token) => ipcRenderer.invoke('rokko:rambox-read', port, token),
  importRambox: input => ipcRenderer.invoke('rokko:rambox-import', input),
  onAppState: callback => {
    const listener = (_event: Electron.IpcRendererEvent, id: string, state: AppLoadState | null): void => callback(id, state);
    ipcRenderer.on('rokko:app-state', listener);
    return () => { ipcRenderer.removeListener('rokko:app-state', listener); };
  },
  onSnapshot: callback => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: AppSnapshot): void => callback(snapshot);
    ipcRenderer.on('rokko:snapshot-changed', listener);
    return () => { ipcRenderer.removeListener('rokko:snapshot-changed', listener); };
  },
  getSnapshot: () => ipcRenderer.invoke('rokko:snapshot'),
  addApp: (input) => ipcRenderer.invoke('rokko:add-app', input),
  addWorkspace: (name) => ipcRenderer.invoke('rokko:add-workspace', name),
  selectWorkspace: (id) => ipcRenderer.invoke('rokko:select-workspace', id),
  selectApp: (id) => ipcRenderer.invoke('rokko:select-app', id),
  removeApp: (id) => ipcRenderer.invoke('rokko:remove-app', id),
  updateApp: (id, input) => ipcRenderer.invoke('rokko:update-app', id, input),
  renameWorkspace: (id, name) => ipcRenderer.invoke('rokko:rename-workspace', id, name),
  removeWorkspace: (id, destinationId) => ipcRenderer.invoke('rokko:remove-workspace', id, destinationId),
  reorderApp: (id, direction) => ipcRenderer.invoke('rokko:reorder-app', id, direction),
  testNotification: (id) => ipcRenderer.invoke('rokko:test-notification', id),
  getServiceIcon: (url) => ipcRenderer.invoke('rokko:service-icon', url),
  updateBounds: (bounds) => ipcRenderer.send('rokko:bounds', bounds),
  setDockTooltip: (bounds) => ipcRenderer.send('rokko:dock-tooltip', bounds),
  setOverlayOpen: (open) => ipcRenderer.send('rokko:overlay', open),
  goBack: () => ipcRenderer.invoke('rokko:back'),
  goForward: () => ipcRenderer.invoke('rokko:forward'),
  reload: () => ipcRenderer.invoke('rokko:reload'),
  openExternal: (url) => ipcRenderer.invoke('rokko:external', url)
};
contextBridge.exposeInMainWorld('rokko', api);
