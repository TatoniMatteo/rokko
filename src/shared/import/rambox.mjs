import { normalizeHttpsUrl, validTitle } from '../security/validation.mjs';

export function importUrl(value) {
  const url = new URL(normalizeHttpsUrl(value));
  if ([...url.searchParams.keys()].some(key => /token|password|secret|auth|session|credential|api.?key|signature|^code$/i.test(key)) ||
      /token|password|secret|access_token/i.test(url.hash)) throw new Error('Remove credentials from the service URL');
  return url.href;
}

export function parseRamboxMetadata(value) {
  if (!value || typeof value !== 'object' || value.format !== 'rokko-rambox-metadata' || value.version !== 1 ||
      value.source?.adapter !== 'mcp-list-apps' || !Array.isArray(value.services) || value.services.length > 100 ||
      !Array.isArray(value.workspaces) || value.workspaces.length) throw new Error('Unsupported service list');
  const ids = new Set();
  return value.services.map(item => {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 256 || ids.has(item.id) ||
        typeof item.name !== 'string' || item.name.length > 256) throw new Error('Invalid service list');
    ids.add(item.id);
    let url = '';
    try { url = importUrl(item.url); } catch { /* The preview requires the user to correct this URL. */ }
    return { sourceId: item.id, name: item.name, url };
  });
}

export function planRamboxImport(data, input, uuid) {
  if (!input || !Array.isArray(input.services) || !input.services.length ||
      data.apps.length + input.services.length > 100) throw new Error('Select between 1 and 100 applications in total');
  const needsWorkspace = input.services.some(item => item?.workspaceId === null);
  const workspace = needsWorkspace ? { id: uuid(), name: validTitle(input.newWorkspaceName) } : null;
  if (workspace && (data.workspaces.length >= 30 || data.workspaces.some(item => item.name === workspace.name))) {
    throw new Error('Choose an existing workspace or a different new workspace name');
  }
  const workspaces = workspace ? [...data.workspaces, workspace] : [...data.workspaces];
  const apps = input.services.map(item => {
    if (!item || typeof item !== 'object') throw new Error('Invalid service');
    const workspaceId = item.workspaceId === null ? workspace?.id : item.workspaceId;
    if (!workspaces.some(w => w.id === workspaceId)) throw new Error('Choose a destination for every service');
    const id = uuid();
    return { id, name: validTitle(item.name), url: importUrl(item.url), workspaceId, partition: `persist:rokko-${id}` };
  });
  return { ...data, workspaces, apps: [...data.apps, ...apps], selectedWorkspaceId: apps[0].workspaceId };
}
