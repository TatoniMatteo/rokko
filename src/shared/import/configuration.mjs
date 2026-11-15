import { importUrl } from './rambox.mjs';
import { validTitle } from '../security/validation.mjs';
import { validIcon } from '../services/service-icons.mjs';
import { defaultPreferences, validatePreferences } from '../preferences/preferences.mjs';
import { sharesWorkspace, servicePartition } from '../apps/sessions.mjs';

export const configurationLimit = 16 * 1024 * 1024;
const keys = (value, allowed) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => allowed.includes(key));
const key = (value) => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const invalid = () => {
  throw new Error('Unsupported configuration file.');
};

/** This format is a portable description, never a copy of a Chromium profile. */
export function validateConfiguration(input) {
  if (
    !keys(input, ['format', 'version', 'workspaces', 'services', 'appearance']) ||
    input.format !== 'rokko-configuration' ||
    input.version !== 1 ||
    !Array.isArray(input.workspaces) ||
    input.workspaces.length > 30 ||
    !Array.isArray(input.services) ||
    input.services.length > 100
  )
    invalid();
  const workspaces = new Set(),
    services = new Set();
  const normalized = {
    format: 'rokko-configuration',
    version: 1,
    workspaces: input.workspaces.map((workspace) => {
      if (!keys(workspace, ['key', 'name']) || !key(workspace.key) || workspaces.has(workspace.key))
        invalid();
      workspaces.add(workspace.key);
      return { key: workspace.key, name: validTitle(workspace.name) };
    }),
    services: input.services.map((service) => {
      if (
        !keys(service, ['key', 'name', 'url', 'workspaceKey', 'shared', 'icon']) ||
        !key(service.key) ||
        services.has(service.key) ||
        (service.workspaceKey !== null && !workspaces.has(service.workspaceKey)) ||
        typeof service.shared !== 'boolean' ||
        (service.workspaceKey === null && service.shared)
      )
        invalid();
      services.add(service.key);
      const icon = validIcon(service.icon);
      return {
        key: service.key,
        name: validTitle(service.name),
        url: importUrl(service.url),
        workspaceKey: service.workspaceKey,
        shared: service.shared,
        ...(icon === undefined ? {} : { icon }),
      };
    }),
  };
  if (input.appearance !== undefined) {
    if (!keys(input.appearance, ['theme', 'seed', 'language', 'dock'])) invalid();
    const preferences = validatePreferences({ ...defaultPreferences(), ...input.appearance });
    normalized.appearance = {
      theme: preferences.theme,
      seed: preferences.seed,
      language: preferences.language,
      dock: preferences.dock,
    };
  }
  if (JSON.stringify(normalized).length > configurationLimit) invalid();
  return normalized;
}
export function exportConfiguration(data, preferences) {
  return validateConfiguration({
    format: 'rokko-configuration',
    version: 1,
    workspaces: data.workspaces.map((w) => ({ key: w.id, name: w.name })),
    services: data.apps.map((service) => ({
      key: service.id,
      name: service.name,
      url: service.url,
      workspaceKey: service.workspaceId,
      shared: sharesWorkspace(service),
      ...(service.icon === undefined ? {} : { icon: service.icon }),
    })),
    appearance: {
      theme: preferences.theme,
      seed: preferences.seed,
      language: preferences.language,
      dock: preferences.dock,
    },
  });
}
export function planConfigurationImport(data, preferences, input, options, uuid) {
  const document = validateConfiguration(input);
  if (new Set(document.workspaces.map(workspace => workspace.name)).size !== document.workspaces.length)
    throw new Error('Workspace names are ambiguous. Rename duplicates before importing.');
  if (
    !keys(options, ['duplicates', 'appearance']) ||
    !['skip', 'copy'].includes(options.duplicates) ||
    typeof options.appearance !== 'boolean'
  )
    invalid();
  const workspaces = [...data.workspaces],
    apps = [...data.apps],
    mapping = new Map();
  for (const source of document.workspaces) {
    const matches = workspaces.filter((w) => w.name === source.name);
    if (matches.length > 1)
      throw new Error('Workspace names are ambiguous. Rename duplicates before importing.');
    const workspace = matches[0] ?? { id: uuid(), name: source.name };
    if (!matches.length) workspaces.push(workspace);
    mapping.set(source.key, workspace.id);
  }
  const available = new Map();
  const signature = (service) =>
    JSON.stringify([service.name, service.url, service.workspaceId, sharesWorkspace(service)]);
  for (const service of data.apps)
    available.set(signature(service), (available.get(signature(service)) ?? 0) + 1);
  let added = 0,
    skipped = 0;
  for (const source of document.services) {
    const workspaceId = source.workspaceKey === null ? null : mapping.get(source.workspaceKey);
    const id = uuid();
    const service = {
      id,
      name: source.name,
      url: source.url,
      workspaceId,
      partition: servicePartition(id, workspaceId, source.shared),
      ...(source.icon === undefined ? {} : { icon: source.icon }),
    };
    const count = available.get(signature(service)) ?? 0;
    if (options.duplicates === 'skip' && count) {
      available.set(signature(service), count - 1);
      skipped++;
    } else {
      apps.push(service);
      added++;
    }
  }
  if (apps.length > 100 || workspaces.length > 30)
    throw new Error('Configuration exceeds the service or workspace limit.');
  return {
    data: { ...data, apps, workspaces },
    preferences:
      options.appearance && document.appearance
        ? { ...preferences, ...document.appearance }
        : preferences,
    added,
    skipped,
  };
}
