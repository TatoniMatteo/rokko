import { dockApps, orderedCards } from '../../shared/preferences/preferences.mjs';
import { visibleApps } from '../../shared/apps/sessions.mjs';
/** Resolve only navigation owned by Rokko; all other keys stay with the current page. */
export function shortcutTarget(data, activeAppId, input, configuring = false, preferences) {
  if (configuring || input.type !== 'keyDown' || input.isComposing || input.isAutoRepeat || input.meta) return null;
  const apps = preferences ? dockApps(data, preferences) : visibleApps(data);
  const workspaces = preferences ? orderedCards(data, preferences).filter(id => id !== 'global' && !preferences.hiddenWorkspaces.includes(id))
    .map(id => data.workspaces.find(w => w.id === id)) : data.workspaces;
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
      const index = workspaces.findIndex(workspace => workspace.id === workspaceId);
      workspaceId = workspaces[(index + (input.key === 'PageUp' ? -1 : 1) + workspaces.length)
        % workspaces.length]?.id;
      if (!workspaceId || workspaceId === data.selectedWorkspaceId) return null;
      appId = data.apps.find(app => app.id === activeAppId)?.workspaceId === null ? activeAppId : null;
    } else if (input.key === 'Home') appId = null;
    else return null;
  } else return null;
  const selected = apps.find(a => a.id === appId);
  if (selected?.workspaceId) workspaceId = selected.workspaceId;
  return appId === activeAppId && workspaceId === data.selectedWorkspaceId ? null : { appId, workspaceId };
}
