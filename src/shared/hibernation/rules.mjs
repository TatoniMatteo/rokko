import { validTitle } from '../security/validation.mjs';
const object = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => keys.includes(key));
const id = (value) => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const invalid = () => {
  throw new Error('Invalid hibernation rules.');
};
export function defaultHibernation() {
  return {
    hiddenWorkspaces: true,
    protectAudio: true,
    protectDownloads: true,
    protectDeviceAccess: true,
    wakeOnSelection: false,
    startupIncludedServiceIds: [],
    startupExcludedServiceIds: [],
    excludedServiceIds: [],
    rules: [
      {
        id: 'startup',
        name: 'Hibernate at startup',
        enabled: true,
        scope: { kind: 'all' },
        match: 'all',
        conditions: [{ kind: 'startup' }],
      },
    ],
  };
}
export function validateHibernation(input = defaultHibernation()) {
  if (
    !object(input, Object.keys(defaultHibernation())) ||
    ['hiddenWorkspaces', 'protectAudio', 'protectDownloads', 'protectDeviceAccess'].some(
      (key) => typeof input[key] !== 'boolean',
    ) ||
    (input.wakeOnSelection !== undefined && typeof input.wakeOnSelection !== 'boolean') ||
    (input.startupIncludedServiceIds !== undefined &&
      (!Array.isArray(input.startupIncludedServiceIds) ||
        input.startupIncludedServiceIds.length > 100 ||
        input.startupIncludedServiceIds.some((value) => !id(value)) ||
        new Set(input.startupIncludedServiceIds).size !== input.startupIncludedServiceIds.length)) ||
    (input.startupExcludedServiceIds !== undefined &&
      (!Array.isArray(input.startupExcludedServiceIds) ||
        input.startupExcludedServiceIds.length > 100 ||
        input.startupExcludedServiceIds.some((value) => !id(value)) ||
        new Set(input.startupExcludedServiceIds).size !== input.startupExcludedServiceIds.length)) ||
    (input.startupIncludedServiceIds ?? []).some((serviceId) =>
      (input.startupExcludedServiceIds ?? []).includes(serviceId),
    ) ||
    !Array.isArray(input.excludedServiceIds) ||
    input.excludedServiceIds.length > 100 ||
    input.excludedServiceIds.some((value) => !id(value)) ||
    new Set(input.excludedServiceIds).size !== input.excludedServiceIds.length ||
    !Array.isArray(input.rules) ||
    input.rules.length > 20
  )
    invalid();
  const ids = new Set();
  const rules = input.rules.map((rule) => {
    if (
      !object(rule, ['id', 'name', 'enabled', 'scope', 'match', 'conditions']) ||
      !id(rule.id) ||
      ids.has(rule.id) ||
      typeof rule.enabled !== 'boolean' ||
      !['all', 'any'].includes(rule.match) ||
      !object(rule.scope, ['kind', 'id']) ||
      !['all', 'workspace', 'service'].includes(rule.scope.kind) ||
      (rule.scope.kind === 'all' ? rule.scope.id !== undefined : !id(rule.scope.id)) ||
      !Array.isArray(rule.conditions) ||
      !rule.conditions.length ||
      rule.conditions.length > 6
    )
      invalid();
    ids.add(rule.id);
    const conditions = rule.conditions.map((condition) => {
      if (condition?.kind === 'inactive') {
        if (
          !object(condition, ['kind', 'minutes']) ||
          !Number.isInteger(condition.minutes) ||
          condition.minutes < 1 ||
          condition.minutes > 1440
        )
          invalid();
      } else if (condition?.kind === 'outside-workspace') {
        if (!object(condition, ['kind'])) invalid();
      } else if (condition?.kind === 'startup') {
        if (!object(condition, ['kind'])) invalid();
      } else if (condition?.kind === 'time') {
        if (
          !object(condition, ['kind', 'start', 'end', 'days']) ||
          typeof condition.start !== 'string' ||
          typeof condition.end !== 'string' ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(condition.start) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(condition.end) ||
          condition.start === condition.end ||
          !Array.isArray(condition.days) ||
          !condition.days.length ||
          condition.days.length > 7 ||
          condition.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
          new Set(condition.days).size !== condition.days.length
        )
          invalid();
      } else invalid();
      return { ...condition, ...(condition.kind === 'time' ? { days: [...condition.days] } : {}) };
    });
    return { ...rule, name: validTitle(rule.name), scope: { ...rule.scope }, conditions };
  });
  return {
    ...input,
    wakeOnSelection: input.wakeOnSelection ?? false,
    startupIncludedServiceIds: [...(input.startupIncludedServiceIds ?? [])],
    startupExcludedServiceIds: [...(input.startupExcludedServiceIds ?? [])],
    excludedServiceIds: [...input.excludedServiceIds],
    rules,
  };
}
export function hibernatesAtStartup(policy, service) {
  if (
    policy.excludedServiceIds.includes(service.id) ||
    (policy.startupExcludedServiceIds ?? []).includes(service.id)
  )
    return false;
  if ((policy.startupIncludedServiceIds ?? []).includes(service.id)) return true;
  return policy.rules.some(
    (rule) =>
      rule.enabled &&
      rule.conditions.some((condition) => condition.kind === 'startup') &&
      (rule.scope.kind === 'all' ||
        (rule.scope.kind === 'service' && rule.scope.id === service.id) ||
        (rule.scope.kind === 'workspace' && rule.scope.id === service.workspaceId)) &&
      (rule.match === 'any' || rule.conditions.every((condition) => condition.kind === 'startup')),
  );
}
function timeCondition(condition, now) {
  const date = new Date(now),
    minute = date.getHours() * 60 + date.getMinutes();
  const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const start = minutes(condition.start),
    end = minutes(condition.end),
    overnight = start > end;
  const day = overnight && minute < end ? (date.getDay() + 6) % 7 : date.getDay();
  const matches =
    condition.days.includes(day) &&
    (overnight ? minute >= start || minute < end : minute >= start && minute < end);
  let nextAt = Infinity;
  for (let offset = -1; offset <= 8; offset++) {
    const startDate = new Date(date);
    startDate.setDate(date.getDate() + offset);
    startDate.setHours(Math.floor(start / 60), start % 60, 0, 0);
    if (!condition.days.includes(startDate.getDay())) continue;
    const endDate = new Date(startDate);
    if (overnight) endDate.setDate(endDate.getDate() + 1);
    endDate.setHours(Math.floor(end / 60), end % 60, 0, 0);
    for (const edge of [+startDate, +endDate]) if (edge > now) nextAt = Math.min(nextAt, edge);
  }
  return { matches, nextAt };
}
/** Evaluate metadata only. Never inspect a service's DOM, contents or credentials. */
export function planHibernation(policy, context, lastUsed, sleeping, now) {
  const wanted = new Map(),
    hidden = new Set(context.hiddenWorkspaceIds),
    visible = new Set(context.visibleIds),
    startupIncluded = new Set(policy.startupIncludedServiceIds ?? []),
    startupExcluded = new Set(policy.startupExcludedServiceIds ?? []),
    excluded = new Set(policy.excludedServiceIds);
  let nextAt = Infinity;
  for (const service of context.services) {
    if (context.manualIds.includes(service.id)) continue;
    if (
      policy.hiddenWorkspaces &&
      service.workspaceId !== null &&
      hidden.has(service.workspaceId)
    ) {
      wanted.set(service.id, { kind: 'hidden-workspace' });
      continue;
    }
    const sleepingReason = sleeping.get(service.id)?.reason;
    if (
      sleepingReason &&
      visible.has(service.id) &&
      !policy.wakeOnSelection &&
      !context.wakeRequestedIds?.includes(service.id)
    ) {
      wanted.set(service.id, sleepingReason);
      continue;
    }
    if (
      visible.has(service.id) ||
      excluded.has(service.id) ||
      (policy.protectAudio && service.audible) ||
      (policy.protectDownloads && service.downloading) ||
      (policy.protectDeviceAccess && service.deviceAccess)
    )
      continue;
    if (
      startupIncluded.has(service.id) &&
      !startupExcluded.has(service.id) &&
      (context.startup ||
        (sleepingReason?.kind === 'rule' &&
          sleepingReason.ruleId === 'startup' &&
          !visible.has(service.id)))
    ) {
      wanted.set(service.id, { kind: 'rule', ruleId: 'startup', name: 'Hibernate at startup' });
      continue;
    }
    for (const rule of policy.rules) {
      if (
        !rule.enabled ||
        (rule.scope.kind === 'service' && rule.scope.id !== service.id) ||
        (rule.scope.kind === 'workspace' && rule.scope.id !== service.workspaceId)
      )
        continue;
      const results = rule.conditions.map((condition) => {
        if (condition.kind === 'time') return timeCondition(condition, now);
        if (condition.kind === 'startup')
          return {
            matches:
              !startupExcluded.has(service.id) &&
              (context.startup ||
                (sleepingReason?.kind === 'rule' &&
                  sleepingReason.ruleId === rule.id &&
                  !visible.has(service.id))),
          };
        if (condition.kind === 'outside-workspace')
          return {
            matches:
              service.workspaceId !== null && service.workspaceId !== context.selectedWorkspaceId,
          };
        if (!service.loaded && !sleeping.get(service.id)?.wasLoaded) return { matches: false };
        const deadline = (lastUsed.get(service.id) ?? now) + condition.minutes * 60000;
        return { matches: now >= deadline, nextAt: deadline > now ? deadline : undefined };
      });
      for (const result of results) if (result.nextAt) nextAt = Math.min(nextAt, result.nextAt);
      if (rule.match === 'all' ? results.every((r) => r.matches) : results.some((r) => r.matches)) {
        wanted.set(service.id, { kind: 'rule', ruleId: rule.id, name: rule.name });
        break;
      }
    }
  }
  return { wanted, nextAt };
}
