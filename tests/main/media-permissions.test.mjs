import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes, createRequire } from 'node:module';
import vm from 'node:vm';
import { notificationOrigin } from '../../src/shared/notifications/notifications.mjs';
const require = createRequire(import.meta.url);
const code =
  stripTypeScriptTypes(
    readFileSync(
      new URL('../../src/main/permissions/media-permissions.ts', import.meta.url),
      'utf8',
    ),
    { mode: 'strip' },
  )
    .replace(/import \{([^}]+)\} from ['"]([^'"]+)['"];?/g, 'const {$1} = require("$2");')
    .replace('export class MediaPermissions', 'class MediaPermissions') +
  '\nexports.MediaPermissions=MediaPermissions;';
function fixture() {
  const timers = [],
    sources = [
      { id: 'one', name: 'First screen' },
      { id: 'two', name: 'Second screen' },
    ];
  const exports = {};
  const native = {
    desktopCapturer: { getSources: async () => sources },
    webContents: { fromFrame: (frame) => frame.contents },
  };
  vm.runInNewContext(code, {
    exports,
    Map,
    Set,
    setTimeout: (fn) => {
      timers.push(fn);
      return fn;
    },
    clearTimeout: () => {},
    require: (name) =>
      name === 'electron'
        ? native
        : name.endsWith('notifications.mjs')
          ? { notificationOrigin }
          : require(name),
  });
  const owners = new Map();
  const manager = new exports.MediaPermissions(
    (contents) => owners.get(contents),
    () => {},
    () => {},
  );
  const view = (id, active = true) => {
    const value = {
      url: 'https://same.example/',
      isDestroyed: () => false,
      getURL() {
        return this.url;
      },
    };
    owners.set(value, { id, active });
    return value;
  };
  const request = (contents, permission = 'media', extra = {}) => {
    const responses = [];
    manager.request(contents, permission, (value) => responses.push(value), {
      isMainFrame: true,
      requestingUrl: contents.url,
      mediaTypes: ['video'],
      ...extra,
    });
    return responses;
  };
  const prompt = () => manager.list().requests[0];
  return { manager, view, request, prompt, owners, timers, sources };
}
test('media requests require an owned top frame', () => {
  const f = fixture(),
    view = f.view('a');
  for (const details of [
    { isMainFrame: false },
    { requestingUrl: 'https://other.example/' },
    { mediaTypes: [] },
  ])
    assert.deepEqual(f.request(view, 'media', details), [false]);
  assert.deepEqual(f.request(view, 'clipboard-read'), [false]);
  assert.deepEqual(f.request(f.view('background', false)), [false]);
  assert.equal(f.manager.list().requests.length, 0);
});
test('camera and microphone grants stay per view', () => {
  const f = fixture(),
    a = f.view('a'),
    b = f.view('b');
  const responses = f.request(a, 'media', { mediaTypes: ['video', 'audio'] });
  f.manager.respond(f.prompt().id, true);
  assert.deepEqual(responses, [true]);
  for (const mediaType of ['audio', 'video']) {
    assert.equal(f.manager.check(a, 'media', a.url, { isMainFrame: true, mediaType }), true);
    assert.equal(f.manager.check(b, 'media', b.url, { isMainFrame: true, mediaType }), false);
  }
  assert.equal(
    f.manager.check(a, 'media', a.url, { isMainFrame: false, mediaType: 'video' }),
    false,
  );
  f.manager.close();
});
test('navigation and expiry cannot retain stale consent', () => {
  const f = fixture(),
    a = f.view('a');
  const responses = f.request(a);
  a.url = 'https://changed.example/';
  f.manager.respond(f.prompt().id, true);
  assert.deepEqual(responses, [false]);
  assert.equal(f.manager.list().grants.length, 0);
  const expired = f.request(a);
  f.timers.at(-1)();
  assert.deepEqual(expired, [false]);
  assert.equal(f.manager.list().requests.length, 0);
  assert.throws(() => f.manager.respond('unknown', true));
});
test('closing a service denies pending requests', () => {
  const f = fixture(),
    a = f.view('a'),
    b = f.view('b');
  const pending = f.request(a),
    peer = f.request(b);
  f.manager.closeApp('a');
  assert.deepEqual(pending, [false]);
  assert.equal(peer.length, 0);
  assert.equal(f.manager.list().requests[0].appId, 'b');
  f.manager.close();
});
test('screen capture needs an explicit source choice', async () => {
  const f = fixture(),
    a = f.view('a');
  f.request(a, 'display-capture');
  f.manager.respond(f.prompt().id, true);
  let handler;
  f.manager.configure({ setDisplayMediaRequestHandler: (fn) => (handler = fn) });
  const frame = { contents: a };
  frame.top = frame;
  const responses = [];
  handler({ frame, securityOrigin: a.url, userGesture: true }, (value) => responses.push(value));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(responses.length, 0);
  assert.equal(f.prompt().sources.length, 2);
  f.manager.respond(f.prompt().id, true, 'two');
  assert.equal(responses[0].video.id, 'two');
  handler({ frame, securityOrigin: a.url, userGesture: true }, (value) => responses.push(value));
  assert.equal(responses[1], null);
  f.manager.close();
});
