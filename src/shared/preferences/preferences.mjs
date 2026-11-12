export function defaultPreferences(language = 'it') {
  return { version: 1, theme: 'system', seed: '#245dc5', language: language.startsWith('it') ? 'it' : 'en',
    dock: 'left', cardOrder: [], hiddenWorkspaces: [] };
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
  return { ...input, seed: input.seed.toLowerCase(), cardOrder: [...input.cardOrder], hiddenWorkspaces: [...input.hiddenWorkspaces] };
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
