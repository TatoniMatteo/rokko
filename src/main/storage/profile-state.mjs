import { normalizeHttpsUrl, validTitle } from '../../shared/security/validation.mjs';
import { validIcon } from '../../shared/services/service-icons.mjs';
import { validNotificationGrant } from '../../shared/notifications/notifications.mjs';
import { defaultPreferences, validatePreferences } from '../../shared/preferences/preferences.mjs';
import { sharesWorkspace } from '../../shared/apps/sessions.mjs';

export function emptyProfile() {
  return {
    data: {
      version: 1,
      workspaces: [{ id: 'personal', name: 'Personal' }],
      apps: [],
      selectedWorkspaceId: 'personal',
    },
    preferences: defaultPreferences(),
    activeAppId: null,
    notices: [],
  };
}
const validId = (value) => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const fail = () => {
  throw new Error('Invalid profile configuration');
};
const knownKeys = (value, names) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => names.includes(key));

/** Validate the complete snapshot before any write; repair only missing navigation references. */
export function validateProfile(data, preferences, activeAppId = null) {
  if (
    !knownKeys(data, ['version', 'workspaces', 'apps', 'selectedWorkspaceId', 'activeAppId']) ||
    data.version !== 1 ||
    !Array.isArray(data.workspaces) ||
    !data.workspaces.length ||
    data.workspaces.length > 30 ||
    !Array.isArray(data.apps) ||
    data.apps.length > 100
  )
    fail();
  const workspaces = new Set();
  for (const workspace of data.workspaces) {
    if (
      !knownKeys(workspace, ['id', 'name']) ||
      !validId(workspace.id) ||
      workspaces.has(workspace.id) ||
      validTitle(workspace.name) !== workspace.name
    )
      fail();
    workspaces.add(workspace.id);
  }
  const apps = [];
  const ids = new Set();
  const partitions = new Map();
  for (const service of data.apps) {
    if (
      !knownKeys(service, [
        'id',
        'name',
        'url',
        'workspaceId',
        'partition',
        'icon',
        'notificationOrigin',
      ]) ||
      !validId(service.id) ||
      ids.has(service.id) ||
      validTitle(service.name) !== service.name ||
      normalizeHttpsUrl(service.url) !== service.url ||
      (service.workspaceId !== null && !workspaces.has(service.workspaceId)) ||
      typeof service.partition !== 'string' ||
      !/^persist:rokko-[\w-]{1,160}$/.test(service.partition)
    )
      fail();
    const icon = validIcon(service.icon);
    const notificationOrigin = validNotificationGrant(service.notificationOrigin, service.url);
    apps.push({
      id: service.id,
      name: service.name,
      url: service.url,
      workspaceId: service.workspaceId,
      partition: service.partition,
      ...(icon === undefined ? {} : { icon }),
      ...(notificationOrigin === undefined ? {} : { notificationOrigin }),
    });
    if (service.workspaceId === null && service.partition.startsWith('persist:rokko-workspace-'))
      fail();
    const peer = partitions.get(service.partition);
    if (
      peer &&
      (!sharesWorkspace(peer) ||
        !sharesWorkspace(service) ||
        peer.workspaceId !== service.workspaceId)
    )
      fail();
    partitions.set(service.partition, service);
    ids.add(service.id);
  }
  const notices = [];
  const selectedWorkspaceId = workspaces.has(data.selectedWorkspaceId)
    ? data.selectedWorkspaceId
    : data.workspaces[0].id;
  if (selectedWorkspaceId !== data.selectedWorkspaceId)
    notices.push('The previous workspace is unavailable. Opened the first workspace.');
  const active = data.apps.find((service) => service.id === activeAppId);
  const nextActive =
    active && (active.workspaceId === null || active.workspaceId === selectedWorkspaceId)
      ? active.id
      : null;
  if (activeAppId !== null && nextActive === null)
    notices.push('The previous application is unavailable. Your other services are unchanged.');
  const nextPreferences = validatePreferences(preferences);
  nextPreferences.cardOrder = nextPreferences.cardOrder.filter(
    (id) => id === 'global' || workspaces.has(id),
  );
  nextPreferences.hiddenWorkspaces = nextPreferences.hiddenWorkspaces.filter((id) =>
    workspaces.has(id),
  );
  nextPreferences.hibernation.excludedServiceIds=nextPreferences.hibernation.excludedServiceIds.filter(id=>ids.has(id));
  nextPreferences.hibernation.rules=nextPreferences.hibernation.rules.filter(rule=>rule.scope.kind==='all'||(rule.scope.kind==='service'?ids:workspaces).has(rule.scope.id));
  nextPreferences.mutedServices = nextPreferences.mutedServices.filter(id => ids.has(id));
  if (!ids.has(nextPreferences.split.secondaryId)) nextPreferences.split.secondaryId = null;
  return {
    data: structuredClone({
      version: 1,
      workspaces: data.workspaces,
      apps,
      selectedWorkspaceId,
    }),
    preferences: nextPreferences,
    activeAppId:
      active?.workspaceId && nextPreferences.hiddenWorkspaces.includes(active.workspaceId)
        ? null
        : nextActive,
    notices,
  };
}
