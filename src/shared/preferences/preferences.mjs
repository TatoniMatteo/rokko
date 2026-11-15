export function defaultPreferences(language = 'it') {
  return { version: 1, theme: 'system', seed: '#245dc5', language: language.startsWith('it') ? 'it' : 'en',
    dock: 'left', cardOrder: [], hiddenWorkspaces: [], split: {secondaryId:null,ratio:0.5}, mutedServices: [] };
}
export function validatePreferences(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !Object.keys(defaultPreferences()).includes(key)) || input.version !== 1 ||
      !['light', 'dark', 'system'].includes(input.theme) || !['it', 'en'].includes(input.language) ||
      !['left', 'right', 'top', 'bottom'].includes(input.dock) || typeof input.seed !== 'string' || !/^#[\da-f]{6}$/i.test(input.seed)) {
    throw new Error('Invalid preferences');
  }
  for (const key of ['cardOrder', 'hiddenWorkspaces']) {
    const ids = input[key];
    if (!Array.isArray(ids) || ids.length > 31 || new Set(ids).size !== ids.length ||
        ids.some(id => typeof id !== 'string' || !id || id.length > 128) ||
        (key === 'hiddenWorkspaces' && ids.includes('global'))) throw new Error('Invalid layout');
  }
  const split = input.split ?? {secondaryId:null,ratio:0.5};
  if (!split || typeof split !== 'object' || Array.isArray(split) || Object.keys(split).some(key => !['secondaryId','ratio'].includes(key)) ||
      (split.secondaryId !== null && (typeof split.secondaryId !== 'string' || !/^[\w-]{1,128}$/.test(split.secondaryId))) ||
      !Number.isFinite(split.ratio) || split.ratio < 0.25 || split.ratio > 0.75) throw new Error('Invalid split layout');
  const mutedServices = input.mutedServices ?? [];
  if (!Array.isArray(mutedServices) || mutedServices.length > 100 || new Set(mutedServices).size !== mutedServices.length || mutedServices.some(id => typeof id !== 'string' || !/^[\w-]{1,128}$/.test(id))) throw new Error('Invalid muted services');
  return { ...input, split:{...split}, mutedServices:[...mutedServices], seed: input.seed.toLowerCase(), cardOrder: [...input.cardOrder], hiddenWorkspaces: [...input.hiddenWorkspaces] };
}
export function orderedCards(data, preferences) {
  const ids = ['global', ...data.workspaces.map(w => w.id)];
  return [...preferences.cardOrder.filter(id => ids.includes(id)), ...ids.filter(id => !preferences.cardOrder.includes(id))];
}
export function dockApps(data, preferences) {
  return orderedCards(data, preferences).filter(id => !preferences.hiddenWorkspaces.includes(id))
    .flatMap(id => data.apps.filter(a => a.workspaceId === (id === 'global' ? null : id)));
}
export function moveApp(data, id, targetId, after) {
  const source = data.apps.find(a => a.id === id), target = data.apps.find(a => a.id === targetId);
  if (!source || !target || source.workspaceId !== target.workspaceId || typeof after !== 'boolean') throw new Error('Invalid reorder');
  if (id === targetId) return data;
  const apps = data.apps.filter(a => a.id !== id);
  apps.splice(apps.findIndex(a => a.id === targetId) + (after ? 1 : 0), 0, source);
  return { ...data, apps };
}
export function languageList(language) { return language === 'it' ? 'it-IT,it,en-US,en' : 'en-US,en,it-IT,it'; }
