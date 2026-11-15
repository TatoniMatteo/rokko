import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createRuntime } from './runtime.mjs';
import { connect } from './cdp.mjs';
import { eventually } from './service-fixture.mjs';
import { interfaceDriver } from './interface-driver.mjs';
process.env.ROKKO_PROFILE_QA = '1';
const { launch, config, output, values } = await createRuntime('.codex/tasks/reliability-qa', {
  isolateDesktop: true,
});
const key = join(config, 'key.pem'),
  cert = join(config, 'cert.pem');
execFileSync(
  'openssl',
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    key,
    '-out',
    cert,
    '-days',
    '1',
    '-subj',
    '/CN=linux.rokko.test',
  ],
  { stdio: 'ignore' },
);
const pub = execFileSync('openssl', ['x509', '-in', cert, '-pubkey', '-noout']);
const pin = createHash('sha256')
  .update(execFileSync('openssl', ['pkey', '-pubin', '-outform', 'DER'], { input: pub }))
  .digest('base64');
const server = createServer(
  { key: await readFile(key), cert: await readFile(cert) },
  (req, res) => {
    if (req.url === '/sw.js') {
      res.setHeader('content-type', 'application/javascript');
      res.end(
        'self.addEventListener("install",e=>e.waitUntil(self.skipWaiting()));self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));',
      );
      return;
    }
    if (req.url === '/download' || req.url === '/download-slow') {
      res.setHeader('content-type', 'application/octet-stream');
      res.setHeader('content-disposition', 'attachment; filename="../../report?.txt"');
      if (req.url === '/download-slow') {
        const chunk = Buffer.alloc(16384, 65);
        res.setHeader('content-length', 1048576);
        let sent = 0;
        const timer = setInterval(() => {
          res.write(chunk);
          sent += chunk.length;
          if (sent >= 1048576) {
            clearInterval(timer);
            res.end();
          }
        }, 40);
        res.on('close', () => clearInterval(timer));
      } else res.end(Buffer.alloc(65536, 65));
      return;
    }
    res.setHeader('content-type', 'text/html');
    res.end(
      '<!doctype html><title>Linux fixture</title><h1>Linux fixture</h1><input id="draft"><script>window.fixture=true;window.captureState="idle";</script>',
    );
  },
);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `https://linux.rokko.test:${server.address().port}`;
let browser, client, native;
const result = { passed: false };
try {
  browser = await launch('linux', [
    '--force-renderer-accessibility',
    '--host-resolver-rules=MAP linux.rokko.test 127.0.0.1,MAP accounts.google.com 127.0.0.1',
    `--ignore-certificate-errors-spki-list=${pin}`,
  ]);
  client = await connect(browser.browserUrl);
  const sessions = new Map();
  client.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
    sessions.set(targetInfo.targetId, sessionId);
    void client.send('Runtime.runIfWaitingForDebugger', {}, sessionId);
  });
  client.on('Target.detachedFromTarget', ({ targetId }) => sessions.delete(targetId));
  await client.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: true,
    filter: [{ type: 'page', exclude: false }, { exclude: true }],
  });
  const evaluate = async (session, expression) => {
    const response = await client.send(
      'Runtime.evaluate',
      { expression, returnByValue: true, userGesture: true },
      session,
    );
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const page = async (path) =>
    eventually(async () => {
      for (const [id, session] of sessions) {
        try {
          if (
            await evaluate(
              session,
              `location.href===${JSON.stringify(origin + path)}&&window.fixture===true`,
            )
          )
            return { id, session };
        } catch {
          /* Starting/detached page. */
        }
      }
    }, path);
  const control = JSON.parse(await readFile(join(config, 'reliability-control.json'), 'utf8'));
  native = async (command) => {
    const response = await fetch(`http://127.0.0.1:${control.port}`, {
      method: 'POST',
      headers: { 'x-qa-key': control.key },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(4000),
    });
    assert.ok(response.ok);
    return response.json();
  };
  const ui = interfaceDriver(browser);
  const activate = ui.activate;
  ui.activate = async (label) => {
    result.phase = label;
    await activate(label);
  };
  result.runtime = await browser.command('Browser.getVersion');
  async function add(name, path) {
    await ui.activate('Home');
    await ui.activate('Aggiungi applicazione');
    await ui.activate('Servizio personalizzato');
    await ui.fill('#app-name', name);
    await ui.fill('#app-url', origin + path);
    await ui.activate('Aggiungi applicazione');
    await page(path);
    return (await ui.state()).activeAppId;
  }
  async function showing(name, path) {
    await ui.activate(name);
    await eventually(async () => {
      const status = await native({ action: 'status' });
      const target = status.contents.find((value) => value.url === origin + path);
      return target && status.attachedIds.includes(target.id);
    }, 'attached ' + name);
  }
  const first = await add('Linux A', '/first');
  let firstPage = await page('/first');
  await evaluate(
    firstPage.session,
    'document.cookie="synthetic=preserved;Path=/;Secure;SameSite=Lax;Max-Age=3600";navigator.serviceWorker.register("/sw.js").then(()=>navigator.serviceWorker.ready).then(()=>window.workerReady=true)',
  );
  await eventually(() => evaluate(firstPage.session, 'window.workerReady===true'), 'worker ready');
  const second = await add('Linux B', '/second');
  const secondPage = await page('/second');
  assert.ok((await evaluate(secondPage.session, 'document.cookie')).includes('preserved'));
  await showing('Linux A', '/first');
  await evaluate(
    firstPage.session,
    'navigator.mediaDevices.getUserMedia({video:true}).then(stream=>{window.capture=stream;window.captureState="active"}).catch(()=>window.captureState="denied")',
  );
  await eventually(
    async () => (await ui.state()).permissionState.requests.some((r) => r.appId === first),
    'camera request',
  );
  await ui.activate('Controlla permessi');
  await ui.activate('Consenti per questo servizio');
  await eventually(
    () => evaluate(firstPage.session, 'window.captureState==="active"'),
    'camera granted',
  );
  await showing('Linux B', '/second');
  await evaluate(
    secondPage.session,
    'navigator.mediaDevices.getUserMedia({video:true}).then(stream=>{stream.getTracks().forEach(t=>t.stop());window.captureState="active"}).catch(()=>window.captureState="denied")',
  );
  await eventually(
    async () => (await ui.state()).permissionState.requests.some((r) => r.appId === second),
    'shared session has no implicit camera grant',
  );
  await ui.activate('Controlla permessi');
  await ui.activate('Nega');
  await eventually(() => evaluate(secondPage.session, 'window.captureState==="denied"'), 'denied');
  await ui.activate('Revoca accesso del servizio');
  await eventually(async () => (await ui.state()).permissionState.grants.length === 0, 'revoked');
  await showing('Linux A', '/first');
  firstPage = await page('/first');
  assert.ok((await evaluate(firstPage.session, 'document.cookie')).includes('preserved'));
  result.mediaIsolationAndRevocation = true;
  await showing('Linux B', '/second');
  await evaluate(
    secondPage.session,
    'navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{window.microphone=stream;window.microphoneState="active"}).catch(()=>window.microphoneState="denied")',
  );
  await eventually(
    async () => (await ui.state()).permissionState.requests.some((r) => r.appId === second),
    'microphone request',
  );
  await ui.activate('Controlla permessi');
  await ui.activate('Consenti per questo servizio');
  await eventually(
    () => evaluate(secondPage.session, 'window.microphoneState==="active"'),
    'microphone granted',
  );
  await evaluate(secondPage.session, 'window.microphone.getTracks().forEach(track=>track.stop())');
  result.microphone = true;
  if (values.x11) {
    await showing('Linux B', '/second');
    await evaluate(
      secondPage.session,
      'navigator.mediaDevices.getDisplayMedia({video:true}).then(stream=>{window.screenCapture=stream;window.screenState="active"}).catch(()=>window.screenState="denied")',
    );
    await eventually(
      async () =>
        (await ui.state()).permissionState.requests.some((r) => r.capabilities.includes('screen')),
      'screen request',
    );
    await ui.activate('Controlla permessi');
    await ui.activate('Consenti per questo servizio');
    const sourcePrompt = await eventually(
      async () => (await ui.state()).permissionState.requests.find((r) => r.sources?.length),
      'screen sources',
    );
    assert.equal(await evaluate(secondPage.session, 'window.screenState'), undefined);
    await ui.activate(sourcePrompt.sources[0].name);
    await eventually(
      () => evaluate(secondPage.session, 'window.screenState==="active"'),
      'explicit screen grant',
    );
    await evaluate(
      secondPage.session,
      'window.screenCapture.getTracks().forEach(track=>track.stop())',
    );
    result.screenPickerTested = true;
  }

  await showing('Linux A', '/first');
  firstPage = await page('/first');
  await ui.activate('Controlli del servizio');
  await ui.activate('Sospendi servizio');
  await eventually(async () => (await ui.state()).suspendedIds.includes(first), 'suspended');
  assert.ok(
    (await native({ action: 'status' })).contents.every((w) => w.url !== origin + '/first'),
  );
  assert.ok(
    (await native({ action: 'status' })).contents.some((w) => w.url === origin + '/second'),
  );
  await ui.activate('Riprendi servizio');
  firstPage = await page('/first');
  assert.ok((await evaluate(firstPage.session, 'document.cookie')).includes('preserved'));
  result.suspensionPreservesPeerAndCookie = true;
  const before = (await native({ action: 'status' })).contents.find(
    (w) => w.url === origin + '/first',
  );
  await native({ action: 'crash', id: before.id });
  await eventually(
    async () => (await ui.state()).appStates[first]?.error === 'crashed',
    'crash reported',
  );
  await ui.activate('Riprova');
  firstPage = await page('/first');
  assert.equal(
    (await native({ action: 'status' })).contents.filter((w) => w.url === origin + '/first').length,
    1,
  );
  assert.ok((await evaluate(firstPage.session, 'document.cookie')).includes('preserved'));
  result.crashRecovery = true;
  // Force a transient Chromium failure, then emit a native resume event without putting the user's PC to sleep.
  await client.send(
    'Fetch.enable',
    { patterns: [{ urlPattern: origin + '/offline' }] },
    firstPage.session,
  );
  client.on('Fetch.requestPaused', ({ requestId }, session) => {
    void client.send(
      'Fetch.failRequest',
      { requestId, errorReason: 'InternetDisconnected' },
      session,
    );
  });
  await evaluate(firstPage.session, 'location.href="/offline"');
  await eventually(async () => (await ui.state()).appStates[first]?.error === -106, 'offline');
  await client.send('Fetch.disable', {}, firstPage.session);
  await native({ action: 'resume' });
  await eventually(
    async () => (await ui.state()).appStates[first]?.status === 'ready',
    'resume recovers transient failure',
    15000,
  );
  assert.equal(
    (await native({ action: 'status' })).contents.filter((w) => w.url === origin + '/offline')
      .length,
    1,
  );
  result.resumeRecovery = true;
  await showing('Linux B', '/second');
  await evaluate(secondPage.session, 'window.open("file:///etc/passwd")');
  assert.equal((await native({ action: 'status' })).external.length, 0);
  await evaluate(secondPage.session, 'window.open("https://example.com/")');
  await eventually(
    async () => (await native({ action: 'status' })).questions.length > 0,
    'external confirmation',
  );
  assert.equal((await native({ action: 'status' })).external.length, 0);
  await evaluate(
    secondPage.session,
    `window.open('https://accounts.google.com:${server.address().port}/oauth');void 0`,
  );
  await eventually(
    async () =>
      (await client.send('Target.getTargets')).targetInfos.some((t) => t.url.includes('/oauth')),
    'oauth popup',
  );
  const targets = (await client.send('Target.getTargets')).targetInfos;
  assert.equal(
    targets.find((t) => t.url.includes('/oauth')).browserContextId,
    targets.find((t) => t.url === origin + '/second').browserContextId,
  );
  result.popupPolicy = true;
  await evaluate(
    secondPage.session,
    '(()=>{const a=document.createElement("a");a.href="/download";a.click()})()',
  );
  await eventually(
    async () => (await ui.run('window.rokko.getDownloads()')).some((d) => d.state === 'completed'),
    'download',
  );
  const done = (await ui.run('window.rokko.getDownloads()')).find((d) => d.state === 'completed');
  assert.equal(done.serviceId, second);
  assert.ok(!/[\\/?]/.test(done.filename));
  assert.ok(
    (await native({ action: 'status' })).saveOptions.some((o) =>
      o.properties?.includes('showOverwriteConfirmation'),
    ),
  );
  await evaluate(
    secondPage.session,
    '(()=>{const a=document.createElement("a");a.href="/download-slow";a.click()})()',
  );
  const active = await eventually(
    async () => (await ui.run('window.rokko.getDownloads()')).find((d) => d.canCancel),
    'active download',
  );
  await ui.run(`window.rokko.cancelDownload(${JSON.stringify(active.id)})`);
  await eventually(
    async () =>
      (await ui.run('window.rokko.getDownloads()')).some(
        (d) => d.id === active.id && d.state === 'cancelled',
      ),
    'cancel download',
  );
  result.downloadCompletionAndCancellation = true;
  await native({ action: 'download-mode', mode: 'invalid' });
  await evaluate(
    secondPage.session,
    '(()=>{const a=document.createElement("a");a.href="/download";a.click()})()',
  );
  await eventually(
    async () =>
      (await ui.run('window.rokko.getDownloads()')).some((d) => d.state === 'interrupted'),
    'invalid download path',
  );
  result.invalidDownloadPath = true;
  if (values.x11 && process.env.ROKKO_QA_NATIVE_CHOOSER === '1') {
    const collision = join(config, 'qa-files/collision.txt');
    await writeFile(collision, 'existing file');
    await native({ action: 'download-mode', mode: 'interactive' });
    for (const mode of ['cancel', 'replace']) {
      const previous = (await ui.run('window.rokko.getDownloads()')).length;
      await evaluate(
        secondPage.session,
        '(()=>{const a=document.createElement("a");a.href="/download";a.click()})()',
      );
      result.phase='native chooser '+mode;
      const choice=await promisify(execFile)(
        '/usr/bin/python3',
        ['scripts/qa/file-chooser.py', collision, mode],
        { timeout: 20000 },
      );
      result.nativeDialogSteps??=[];result.nativeDialogSteps.push(choice.stdout.trim());
      await eventually(
        async () =>
          (await ui.run('window.rokko.getDownloads()')).length > previous &&
          !(await ui.run('window.rokko.getDownloads()')).at(-1).canCancel,
        'native chooser finished',
      );
      assert.equal(
        await readFile(collision, 'utf8'),
        mode === 'cancel' ? 'existing file' : 'A'.repeat(65536),
      );
    }
    result.nativeOverwriteDialog = true;
  }

  await ui.activate('Impostazioni');
  await ui.activate('Esporta diagnostica');
  const report = await eventually(async () => {
    try {
      return JSON.parse(await readFile(join(config, 'qa-files/diagnostics.json'), 'utf8'));
    } catch {
      return null;
    }
  }, 'diagnostics');
  const text = JSON.stringify(report);
  for (const sensitive of [
    'synthetic',
    'preserved',
    'Linux A',
    'Linux B',
    'linux.rokko.test',
    config,
  ])
    assert.ok(!text.includes(sensitive), sensitive);
  assert.ok(report.events.some((e) => e.event === 'service-suspended'));
  assert.ok(report.events.some((e) => e.event === 'renderer-crashed'));
  result.privateDiagnostics = true;
  result.screenPickerTested ??= false; // Screen capture is tested separately on an isolated X11 display only.
  assert.deepEqual((await native({ action: 'status' })).mainErrors, []);
  result.display = values.x11 ? 'x11' : 'wayland';
  result.passed = true;
} catch (error) {
  try{await writeFile(join(output,'failure-downloads.json'),JSON.stringify(await browser.evaluate('window.rokko.getDownloads()'),null,2));}catch{}
  try {
    await writeFile(
      join(output, 'failure-targets.json'),
      JSON.stringify(await client.send('Target.getTargets'), null, 2),
    );
  } catch {}
  try {
    await writeFile(
      join(output, 'failure-native.json'),
      JSON.stringify(await native?.({ action: 'status' }), null, 2),
    );
  } catch {}
  try {
    await writeFile(
      join(output, 'failure.html'),
      await browser.evaluate('document.documentElement.outerHTML'),
    );
  } catch {}
  throw error;
} finally {
  client?.close();
  await browser?.stop();
  await new Promise((resolve) => server.close(resolve));
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
  await rm(config, { recursive: true, force: true });
}
console.log(JSON.stringify(result, null, 2));
