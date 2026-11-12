import { normalizeHttpsUrl, validTitle } from './validation.mjs';
import { validNotificationGrant } from './notifications.mjs';
import { validIcon } from './service-icons.mjs';

export function appInput(data, input) {
  if (!input || typeof input !== 'object') throw new Error('Dati applicazione non validi');
  const workspaceId = input.workspaceId ?? data.selectedWorkspaceId;
  if (!data.workspaces.some(workspace => workspace.id === workspaceId)) throw new Error('Workspace non trovato');
  const url = normalizeHttpsUrl(input.url);
  return { name: validTitle(input.name), url, workspaceId, icon: validIcon(input.icon),
    notificationOrigin: validNotificationGrant(input.notificationOrigin, url) };
}
export function updateApp(data, id, input) {
  const existing = data.apps.find(app => app.id === id);
  if (!existing) throw new Error('Applicazione non trovata');
  const updated = { ...existing, ...appInput(data, input) };
  const apps = existing.workspaceId === updated.workspaceId
    ? data.apps.map(app => app.id === id ? updated : app)
    : [...data.apps.filter(app => app.id !== id), updated];
  return { ...data, apps };
}
export function renameWorkspace(data, id, name) {
  if (!data.workspaces.some(workspace => workspace.id === id)) throw new Error('Workspace non trovato');
  const title = validTitle(name);
  return { ...data, workspaces: data.workspaces.map(workspace => workspace.id === id ? { ...workspace, name: title } : workspace) };
}
export function removeWorkspace(data, id, destinationId) {
  if (data.workspaces.length <= 1) throw new Error('Mantieni almeno un workspace');
  if (id === destinationId || !data.workspaces.some(workspace => workspace.id === id) ||
      !data.workspaces.some(workspace => workspace.id === destinationId)) throw new Error('Scegli un workspace di destinazione');
  return { ...data, workspaces: data.workspaces.filter(workspace => workspace.id !== id),
    selectedWorkspaceId: data.selectedWorkspaceId === id ? destinationId : data.selectedWorkspaceId,
    apps: [...data.apps.filter(app => app.workspaceId !== id),
      ...data.apps.filter(app => app.workspaceId === id).map(app => ({ ...app, workspaceId: destinationId }))] };
}
export function reorderApp(data, id, direction) {
  if (direction !== -1 && direction !== 1) throw new Error('Direzione non valida');
  const app = data.apps.find(item => item.id === id);
  if (!app) throw new Error('Applicazione non trovata');
  const siblings = data.apps.filter(item => item.workspaceId === app.workspaceId);
  const position = siblings.findIndex(item => item.id === id);
  const other = siblings[position + direction];
  if (!other) return data;
  const apps = [...data.apps];
  const first = apps.findIndex(item => item.id === id);
  const second = apps.findIndex(item => item.id === other.id);
  [apps[first], apps[second]] = [apps[second], apps[first]];
  return { ...data, apps };
}
