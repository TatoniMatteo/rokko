import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultHibernation,
  validateHibernation,
  hibernatesAtStartup,
  planHibernation,
} from '../../src/shared/hibernation/rules.mjs';
import { Hibernation } from '../../src/main/lifecycle/hibernation.mjs';
const service = (id, workspaceId = 'work') => ({
  id,
  workspaceId,
  loaded: true,
  audible: false,
  downloading: false,
  deviceAccess: false,
});
const context = () => ({
  services: [service('one'), service('two', 'other'), service('global', null)],
  visibleIds: ['one'],
  hiddenWorkspaceIds: [],
  selectedWorkspaceId: 'work',
  manualIds: [],
  startup: false,
});
const rule = (conditions = [{ kind: 'inactive', minutes: 1 }], patch = {}) => ({
  id: 'rule',
  name: 'Rule',
  enabled: true,
  scope: { kind: 'all' },
  match: 'all',
  conditions,
  ...patch,
});
const plan = (
  policy,
  state = context(),
  now = 60000,
  lastUsed = new Map([
    ['one', 0],
    ['two', 0],
    ['global', 0],
  ]),
  sleeping = new Map(),
) => planHibernation(policy, state, lastUsed, sleeping, now);
test('hidden workspaces sleep by default, globals stay independent', () => {
  const state = context();
  state.hiddenWorkspaceIds = ['work', 'other'];
  state.services[0].audible = true;
  state.services[0].downloading = true;
  state.services[0].deviceAccess = true;
  const result = plan(defaultHibernation(), state);
  assert.deepEqual([...result.wanted.keys()], ['one', 'two']);
  assert.equal(result.wanted.get('one').kind, 'hidden-workspace');
  assert.equal(result.nextAt, Infinity);
  assert.equal(plan({ ...defaultHibernation(), hiddenWorkspaces: false }, state).wanted.size, 0);
});
test('legacy defaults and unsafe rules', () => {
  assert.equal(validateHibernation().hiddenWorkspaces, true);
  assert.equal(validateHibernation().wakeOnSelection, false);
  assert.deepEqual(validateHibernation().startupIncludedServiceIds, []);
  assert.deepEqual(validateHibernation().startupExcludedServiceIds, []);
  const legacy = defaultHibernation();
  delete legacy.wakeOnSelection;
  assert.equal(validateHibernation(legacy).wakeOnSelection, false);
  assert.deepEqual(defaultHibernation().rules[0].conditions, [{ kind: 'startup' }]);
  for (const patch of [
    { hiddenWorkspaces: 1 },
    { wakeOnSelection: 1 },
    { startupExcludedServiceIds: ['one', 'one'] },
    { startupIncludedServiceIds: ['one', 'one'] },
    { startupIncludedServiceIds: ['one'], startupExcludedServiceIds: ['one'] },
    { excludedServiceIds: ['x', 'x'] },
    { rules: [rule([], {})] },
    { rules: [rule([{ kind: 'inactive', minutes: 0 }])] },
    { rules: [rule([{ kind: 'time', start: '22:00', end: '22:00', days: [1] }])] },
    { rules: [rule([{ kind: 'time', start: '99:00', end: '08:00', days: [1] }])] },
    { rules: [rule([{ kind: 'outside-workspace', script: 'bad' }])] },
    { rules: [rule(), rule()] },
    { rules: [rule(undefined, { scope: { kind: 'service' } })] },
  ])
    assert.throws(() => validateHibernation({ ...defaultHibernation(), ...patch }));
});
test('the default startup rule hibernates every service before it is opened', () => {
  const state = context();
  state.startup = true;
  state.visibleIds = [];
  const result = plan(defaultHibernation(), state);
  assert.deepEqual([...result.wanted.keys()], ['one', 'two', 'global']);
  assert.deepEqual(result.wanted.get('one'), {
    kind: 'rule',
    ruleId: 'startup',
    name: 'Hibernate at startup',
  });
  test('startup hibernation can be disabled for one service without changing others', () => {
    const state = context();
    state.startup = true;
    state.visibleIds = [];
    const policy = { ...defaultHibernation(), startupExcludedServiceIds: ['two'] };
    assert.deepEqual([...plan(policy, state).wanted.keys()], ['one', 'global']);
  });
});
test('a service can be enabled for startup without consuming a rule slot', () => {
  const state = context();
  state.startup = true;
  state.visibleIds = [];
  const policy = {
    ...defaultHibernation(),
    rules: [],
    startupIncludedServiceIds: ['two'],
  };
  assert.deepEqual([...plan(policy, state).wanted.keys()], ['two']);
  const restored = validateHibernation(JSON.parse(JSON.stringify(policy)));
  assert.deepEqual(restored.startupIncludedServiceIds, ['two']);
  assert.deepEqual([...plan(restored, state).wanted.keys()], ['two']);
});
test('startup eligibility is independent of the last selected service', () => {
  const policy = {
    ...defaultHibernation(),
    rules: [],
    startupIncludedServiceIds: ['two'],
  };
  assert.equal(hibernatesAtStartup(policy, service('two', 'other')), true);
  assert.equal(hibernatesAtStartup(policy, service('one')), false);
  assert.equal(
    hibernatesAtStartup({ ...policy, excludedServiceIds: ['two'] }, service('two', 'other')),
    false,
  );
});
test('custom rules protect foreground, audio, device access and downloads', () => {
  const policy = { ...defaultHibernation(), rules: [rule()] };
  assert.deepEqual([...plan(policy).wanted.keys()], ['two', 'global']);
  for (const property of ['audible', 'downloading', 'deviceAccess']) {
    const state = context();
    state.services[1][property] = true;
    assert.ok(!plan(policy, state).wanted.has('two'));
  }
  assert.ok(!plan({ ...policy, excludedServiceIds: ['two'] }).wanted.has('two'));
  const state = context();
  state.manualIds = ['two'];
  assert.ok(!plan(policy, state).wanted.has('two'));
});
test('scope, all/any, globals and disabled rules', () => {
  const policy = {
    ...defaultHibernation(),
    rules: [rule([{ kind: 'inactive', minutes: 2 }, { kind: 'outside-workspace' }])],
  };
  assert.equal(plan(policy).wanted.size, 0);
  policy.rules[0].match = 'any';
  assert.deepEqual([...plan(policy).wanted.keys()], ['two']);
  policy.rules[0].scope = { kind: 'service', id: 'global' };
  assert.equal(plan(policy).wanted.size, 0);
  policy.rules[0].conditions = [{ kind: 'inactive', minutes: 1 }];
  assert.deepEqual([...plan(policy).wanted.keys()], ['global']);
  policy.rules[0].enabled = false;
  assert.equal(plan(policy).wanted.size, 0);
});
test('inactivity uses a deadline, never opens unused services', () => {
  const policy = { ...defaultHibernation(), rules: [rule()] };
  const state = context();
  state.services[1].loaded = false;
  assert.ok(!plan(policy, state).wanted.has('two'));
  const sleeping = new Map([['two', { wasLoaded: true }]]);
  assert.ok(plan(policy, state, 60000, undefined, sleeping).wanted.has('two'));
  assert.equal(plan(policy, context(), 1000).nextAt, 60000);
});
test('overnight windows use the starting weekday and exclusive end', () => {
  const policy = {
    ...defaultHibernation(),
    rules: [rule([{ kind: 'time', start: '22:00', end: '08:00', days: [1] }])],
  };
  const date = (day, hour) => +new Date(2026, 10, day, hour, 0, 0); // Monday 16 November.
  assert.ok(plan(policy, context(), date(16, 22)).wanted.has('two'));
  assert.ok(plan(policy, context(), date(17, 7)).wanted.has('two'));
  assert.ok(!plan(policy, context(), date(17, 8)).wanted.has('two'));
  assert.ok(!plan(policy, context(), date(18, 7)).wanted.has('two'));
  assert.equal(plan(policy, context(), date(17, 7)).nextAt, date(17, 8));
});
function managerFixture(startup = false) {
  let now = 0,
    state = { ...context(), policy: defaultHibernation() };
  const timers = new Map(),
    pending = new Map(),
    closed = [],
    woken = [];
  const manager = new Hibernation({
    startup,
    context: () => state,
    now: () => now,
    setTimer: (callback, delay) => {
      const id = {};
      timers.set(id, {
        callback: () => {
          timers.delete(id);
          callback();
        },
        delay,
      });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    close: (id) => {
      closed.push(id);
      return new Promise((resolve) => pending.set(id, resolve));
    },
    wake: (id, loaded) => woken.push({ id, loaded }),
    changed: () => {},
  });
  return { manager, timers, pending, closed, woken, state, setNow: (value) => (now = value) };
}
test('unhidden foreground resumes', async () => {
  const f = managerFixture();
  f.state.policy.rules = [];
  f.state.hiddenWorkspaceIds = ['work'];
  f.state.visibleIds = [];
  f.manager.reconcile();
  await drain();
  f.pending.get('one')();
  await drain();
  assert.ok(f.manager.has('one'));
  f.state.hiddenWorkspaceIds = [];
  f.state.visibleIds = ['one'];
  f.manager.reconcile();
  assert.ok(!f.manager.has('one'));
  assert.deepEqual(f.woken, [{ id: 'one', loaded: true }]);
  f.manager.stop();
});
test('startup hibernation stays asleep on selection until explicitly resumed', async () => {
  const f = managerFixture(true);
  f.state.visibleIds = [];
  f.manager.reconcile();
  await drain();
  assert.deepEqual(f.closed.sort(), ['global', 'one', 'two']);
  for (const resolve of f.pending.values()) resolve();
  await drain();
  assert.ok(f.manager.has('one'));
  assert.ok(f.manager.has('two'));
  assert.ok(f.manager.has('global'));

  f.state.visibleIds = ['two'];
  f.manager.reconcile();
  assert.deepEqual(f.woken, []);
  assert.ok(f.manager.has('two'));
  assert.ok(f.manager.has('one'));
  assert.ok(f.manager.has('global'));
  f.manager.requestWake('two');
  assert.deepEqual(f.woken, [{ id: 'two', loaded: true }]);
  assert.ok(!f.manager.has('two'));
  f.manager.stop();
});
test('startup hibernates an opted-in service even when another service was active', async () => {
  const f = managerFixture(true);
  f.state.policy = {
    ...defaultHibernation(),
    rules: [],
    startupIncludedServiceIds: ['two'],
  };
  f.state.visibleIds = ['one'];
  f.manager.reconcile();
  await drain();
  assert.deepEqual(f.closed, ['two']);
  f.pending.get('two')();
  await drain();
  assert.ok(f.manager.has('two'));
  f.manager.stop();
});
test('wake-on-selection preserves the previous automatic wake behavior', async () => {
  const f = managerFixture(true);
  f.state.policy.wakeOnSelection = true;
  f.state.visibleIds = [];
  f.manager.reconcile();
  await drain();
  for (const resolve of f.pending.values()) resolve();
  await drain();

  f.state.visibleIds = ['two'];
  f.manager.reconcile();
  assert.deepEqual(f.woken, [{ id: 'two', loaded: true }]);
  f.manager.stop();
});
const drain = async () => {
  for (let n = 0; n < 8; n++) await Promise.resolve();
};
test('automatic wake waits for teardown and honors later visibility changes', async () => {
  const f = managerFixture();
  f.state.policy.wakeOnSelection = true;
  f.state.hiddenWorkspaceIds = ['other'];
  f.manager.reconcile();
  assert.ok(f.manager.has('two'));
  await drain();
  f.state.hiddenWorkspaceIds = [];
  f.manager.reconcile();
  assert.ok(f.manager.has('two'));
  assert.equal(f.woken.length, 0);
  f.state.hiddenWorkspaceIds = ['other'];
  f.pending.get('two')();
  await drain();
  assert.ok(f.manager.has('two'));
  assert.equal(f.woken.length, 0);
  f.state.hiddenWorkspaceIds = [];
  f.manager.reconcile();
  assert.ok(!f.manager.has('two'));
  assert.deepEqual(f.woken, [{ id: 'two', loaded: true }]);
  f.manager.stop();
});
test('manual suspensions survive automatic rule changes', async () => {
  const f = managerFixture();
  f.state.hiddenWorkspaceIds = ['other'];
  f.manager.reconcile();
  await drain();
  f.state.manualIds = ['two'];
  f.state.hiddenWorkspaceIds = [];
  f.pending.get('two')();
  await drain();
  assert.equal(f.woken.length, 0);
  f.manager.stop();
});
test('idle scheduler owns one deadline and none for the default policy', async () => {
  const f = managerFixture();
  f.manager.reconcile();
  assert.equal(f.timers.size, 0);
  f.state.policy.rules = [rule()];
  f.manager.reconcile();
  assert.equal(f.timers.size, 1);
  f.manager.reconcile();
  assert.equal(f.timers.size, 1);
  f.setNow(60000);
  [...f.timers.values()][0].callback();
  await drain();
  assert.ok(f.manager.has('two'));
  assert.equal(f.timers.size, 0);
  f.manager.stop();
});

test('old RPC replies preserve the newer lifecycle without dropping configuration changes', async () => {
  const { mergeLifecycleSnapshot } = await import('../../src/shared/apps/lifecycle.mjs');
  const previous = {
    lifecycleRevision: 4,
    loadedIds: ['one'],
    suspendedIds: [],
    suspensionReasons: {},
    data: { name: 'old' },
  };
  const oldReply = {
    lifecycleRevision: 3,
    loadedIds: [],
    suspendedIds: ['one'],
    suspensionReasons: { one: { kind: 'hidden-workspace' } },
    data: { name: 'new' },
  };
  const merged = mergeLifecycleSnapshot(previous, oldReply);
  assert.deepEqual(merged.loadedIds, ['one']);
  assert.deepEqual(merged.data, { name: 'new' });
  assert.equal(merged.lifecycleRevision, 4);
  assert.equal(
    mergeLifecycleSnapshot(previous, { ...oldReply, lifecycleRevision: 5 }).lifecycleRevision,
    5,
  );
});
