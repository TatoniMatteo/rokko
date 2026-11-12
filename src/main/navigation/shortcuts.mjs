import { visibleApps } from '../../shared/apps/sessions.mjs';
/** Resolve only navigation owned by Rokko; all other keys stay with the current page. */
export function shortcutTarget(data, activeAppId, input, configuring = false) {
  if (configuring || input.type !== 'keyDown' || input.isComposing || input.isAutoRepeat || input.meta) return null;
  const apps = visibleApps(data);
  let appId = activeAppId;
  let workspaceId = data.selectedWorkspaceId;
  if (input.control && !input.alt && input.key === 'Tab') {
    if (!apps.length) return null;
    const index = apps.findIndex(app => app.id === activeAppId);
    appId = apps[index < 0 ? input.shift ? apps.length - 1 : 0
      : (index + (input.shift ? -1 : 1) + apps.length) % apps.length].id;
  } else if (input.alt && !input.control && !input.shift) {
    if (/^[1-9]$/.test(input.key)) {
      appId = apps[Number(input.key) - 1]?.id;
      if (!appId) return null;
    } else if (input.key === 'PageUp' || input.key === 'PageDown') {
      const index = data.workspaces.findIndex(workspace => workspace.id === workspaceId);
      workspaceId = data.workspaces[(index + (input.key === 'PageUp' ? -1 : 1) + data.workspaces.length)
        % data.workspaces.length]?.id;
      if (!workspaceId || workspaceId === data.selectedWorkspaceId) return null;
      appId = data.apps.find(app => app.id === activeAppId)?.workspaceId === null ? activeAppId : null;
    } else if (input.key === 'Home') appId = null;
    else return null;
  } else return null;
  return appId === activeAppId && workspaceId === data.selectedWorkspaceId ? null : { appId, workspaceId };
}
