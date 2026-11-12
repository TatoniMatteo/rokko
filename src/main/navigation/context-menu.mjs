/** Only local shell identifiers can request one of these bounded native menus. */
export function contextMenuItems(data, input, language, loadedIds = [], hiddenIds = []) {
  if (!input || typeof input !== 'object' || !['service', 'workspace', 'global'].includes(input.kind) ||
      typeof input.id !== 'string' || input.id.length > 128) throw new Error('Invalid context menu');
  const it = language === 'it';
  const item = (action, en, italian, enabled = true) => ({ action, label: it ? italian : en, enabled });
  if (input.kind === 'service') {
    if (!data.apps.some(service => service.id === input.id)) throw new Error('Unknown service');
    return [item('open', 'Open application', 'Apri applicazione'), item('edit', 'Edit application', 'Modifica applicazione'),
      item('reload', 'Reload', 'Ricarica', loadedIds.includes(input.id)), item('browser', 'Open in browser', 'Apri nel browser')];
  }
  if (input.kind === 'global') {
    if (input.id !== 'global') throw new Error('Invalid context menu');
    return [item('services', 'Manage services', 'Gestisci servizi')];
  }
  if (!data.workspaces.some(workspace => workspace.id === input.id)) throw new Error('Unknown workspace');
  return [item('edit', 'Workspace settings', 'Impostazioni workspace'),
    item('services', 'Manage services', 'Gestisci servizi'), hiddenIds.includes(input.id) ? item('show', 'Show in dock', 'Mostra nella barra') : item('hide', 'Hide from dock', 'Nascondi dalla barra')];
}
