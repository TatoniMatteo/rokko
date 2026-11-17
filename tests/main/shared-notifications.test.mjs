import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import * as policy from '../../src/shared/notifications/notifications.mjs';
import * as payload from '../../src/shared/notifications/persistent-notifications.mjs';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../../src/main/notifications/persistent-notifications.ts', import.meta.url), 'utf8');
const input = source.replaceAll('import.meta.dirname', '__dirname');
const code = nodeModule.stripTypeScriptTypes
  ? nodeModule.stripTypeScriptTypes(input.replace('constructor(private readonly options: Options) {',
    'constructor(options: Options) { this.options = options;'), { mode: 'strip' })
    .replace(/import \{([^}]+)\} from ['"]([^'"]+)['"];?/g, 'const {$1} = require("$2");')
    .replace('export class PersistentNotifications', 'class PersistentNotifications') + '\nexports.PersistentNotifications = PersistentNotifications;'
  : require('typescript').transpileModule(input, { compilerOptions: { module: 1, target: 9 } }).outputText;

function fixture() {
  const handlers = new Map();
  const nativeNotifications = [];
  const changes = [];
  class NativeNotification extends EventEmitter {
    static isSupported() { return true; }
    constructor(options) { super(); this.options = options; nativeNotifications.push(this); }
    show() { queueMicrotask(() => this.emit('show')); }
    close() { this.emit('close'); }
  }
  const electron = { ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
    Notification: NativeNotification,
    nativeImage: { createFromPath: () => ({ resize: () => ({}) }) } };
  const exports = {};
  vm.runInNewContext(code, { exports, __dirname: '/qa/main', setTimeout, clearTimeout,
    require: name => name === 'electron' ? electron : name.endsWith('/notifications.mjs') ? policy
      : name.endsWith('/persistent-notifications.mjs') ? payload : require(name) });
  const apps = new Map();const views = new Map();
  const activeApps = new Set();
  const manager = new exports.PersistentNotifications({ icon: '/qa/icon.png', app: id => apps.get(id),
    view: id => views.get(id), isActive: id => activeApps.has(id),
    notificationsChanged: value => changes.push(value), activate() {} });
  function session() {
    const workers = new Map();const registered = [];const removed = [];
    const serviceWorkers = new EventEmitter();
    serviceWorkers.getAllRunning = () => Object.fromEntries([...workers].map(([id, worker]) => [id, { scope: worker.scope }]));
    serviceWorkers.getWorkerFromVersionID = id => workers.get(id);
    const value = { serviceWorkers, registerPreloadScript: script => { const id = `${registered.length}`; registered.push(script); return id; },
      unregisterPreloadScript: id => removed.push(id) };
    return { value, registered, removed, workers };
  }
  const app = (id, url, session) => {
    const sent = [];
    const view = { session, sent, isDestroyed: () => false, sendToFrame: (...args) => sent.push(args) };
    const value = { id, url, notificationOrigin: new URL(url).origin };apps.set(id, value);
    views.set(id, view);return value;
  };
  const worker = scope => {
    const callbacks = new Map();return { scope, callbacks, ipc: { handle: (name, fn) => callbacks.set(name, fn), on() {} } };
  };
  const request = (ses, worker) => worker.callbacks.get('rokko:persistent-notification')(
    { session: ses, serviceWorker: worker }, { action: 'list', scope: worker.scope, tag: '' });
  return { manager, session, app, worker, request, apps, views, handlers, nativeNotifications, changes, activeApps };
}

test('document notifications update the dock and return events to their frame', async () => {
  const f = fixture();
  const ses = f.session();
  const app = f.app('app', 'https://same.example/', ses.value);
  f.manager.configure(app, ses.value);
  const handler = f.handlers.get('rokko:persistent-notification');
  const result = await handler({
    sender: f.views.get('app'),
    senderFrame: { url: 'https://same.example/chat', processId: 7, routingId: 8 },
  }, {
    action: 'show', scope: 'https://same.example/chat', title: 'Message', body: 'Hello',
    tag: '', data: 'null', silent: false, requireInteraction: false,
  });
  assert.equal(result.title, 'Message');
  assert.equal(f.manager.counts().app, 1);
  f.nativeNotifications[0].emit('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.views.get('app').sent[0][0][0], 7);
  assert.equal(f.views.get('app').sent[0][0][1], 8);
  assert.equal(f.views.get('app').sent[0][1], 'rokko:persistent-event');
  assert.equal(f.views.get('app').sent[0][2].kind, 'notificationclick');
  f.nativeNotifications[0].emit('close');
  assert.equal(Object.keys(f.manager.counts()).length, 0);
});

test('Telegram badge counts repeated tagged notifications and clears when the service is opened', async () => {
  const f = fixture();
  const ses = f.session();
  const app = f.app('telegram', 'https://web.telegram.org/', ses.value);
  f.manager.configure(app, ses.value);
  const handler = f.handlers.get('rokko:persistent-notification');
  const sender = f.views.get('telegram');
  const show = (title) => handler({
    sender,
    senderFrame: { url: 'https://web.telegram.org/a/', processId: 7, routingId: 8 },
  }, {
    action: 'show', scope: 'https://web.telegram.org/a/', title, body: 'Message',
    tag: 'telegram-updates', data: 'null', silent: false, requireInteraction: false,
  });

  await show('First message');
  await show('Second message');
  assert.equal(f.manager.counts().telegram, 2);

  f.manager.markRead('telegram');
  assert.equal(f.manager.counts().telegram, undefined);
  f.activeApps.add('telegram');
  await show('Third message');
  assert.equal(f.manager.counts().telegram, undefined);
  f.activeApps.delete('telegram');
  await show('Fourth message');
  assert.equal(f.manager.counts().telegram, 1);
  f.nativeNotifications.at(-1).emit('close');
  assert.equal(f.manager.counts().telegram, 1);
  await f.manager.closeApp('telegram');
  assert.equal(f.manager.counts().telegram, undefined);
});

test('worker owner follows shared origin', async () => {
  const f = fixture();const ses = f.session();const worker = f.worker('https://second.example/');ses.workers.set(1, worker);
  f.manager.configure(f.app('first', 'https://first.example/', ses.value), ses.value);
  f.manager.configure(f.app('second', 'https://second.example/', ses.value), ses.value);
  assert.equal((await f.request(ses.value, worker)).length, 0);
  f.apps.get('second').notificationOrigin = undefined;
  await assert.rejects(async () => f.request(ses.value, worker), /not allowed/);
  await assert.rejects(async () => worker.callbacks.get('rokko:persistent-notification')({ session: {}, serviceWorker: worker }, {}), /Unauthorized/);
});
test('shared preloads survive owner removal', async () => {
  const f = fixture();const ses = f.session();const worker = f.worker('https://same.example/');ses.workers.set(1, worker);
  f.manager.configure(f.app('first', worker.scope, ses.value), ses.value);
  f.manager.configure(f.app('second', worker.scope, ses.value), ses.value);
  assert.equal(ses.registered.length, 2);
  await f.manager.closeApp('first');f.apps.delete('first');f.manager.unregister('first');
  assert.equal(ses.removed.length, 0);
  assert.equal((await f.request(ses.value, worker)).length, 0);
  f.manager.unregister('second');assert.equal(ses.removed.length, 2);
});
test('changed session revokes old workers', async () => {
  const f = fixture();const old = f.session();const next = f.session();const worker = f.worker('https://same.example/');old.workers.set(1, worker);
  const app = f.app('app', worker.scope, old.value);f.manager.configure(app, old.value);
  f.views.set('app', { session: next.value });f.manager.configure(app, next.value);
  assert.equal(old.removed.length, 2);assert.equal(next.registered.length, 2);
  await assert.rejects(async () => f.request(old.value, worker), /not allowed/);
});

test('stopped worker does not break view creation', () => {
  const f=fixture(),ses=f.session();ses.workers.set(9,{scope:'https://same.example/'});
  ses.value.serviceWorkers.getWorkerFromVersionID=()=>{throw new Error('Worker has stopped');};
  assert.doesNotThrow(()=>f.manager.configure(f.app('app','https://same.example/',ses.value),ses.value));
});
