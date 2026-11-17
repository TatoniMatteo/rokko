import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createRuntime } from './runtime.mjs';
import { connect } from './cdp.mjs';
import { serviceFixture, eventually } from './service-fixture.mjs';
import { interfaceDriver } from './interface-driver.mjs';
process.env.ROKKO_PROFILE_QA = '1';
const { launch, config, output } = await createRuntime('.codex/tasks/hibernation/qa');
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
    '/CN=hibernate.rokko.test',
  ],
  { stdio: 'ignore' },
);
const publicKey = execFileSync('openssl', ['x509', '-in', cert, '-pubkey', '-noout']);
const pin = createHash('sha256')
  .update(execFileSync('openssl', ['pkey', '-pubin', '-outform', 'DER'], { input: publicKey }))
  .digest('base64');
const server = createServer(
  { key: await readFile(key), cert: await readFile(cert) },
  (req, res) => {
    res.setHeader('content-type', req.url.endsWith('.js') ? 'application/javascript' : 'text/html');
    if (req.url === '/sw.js')
      res.end(
        'self.addEventListener("install",e=>e.waitUntil(self.skipWaiting()));self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));self.addEventListener("message",e=>e.ports[0]?.postMessage("pong"));',
      );
    else if (req.url === '/shared.js')
      res.end(
        'onconnect=e=>{const p=e.ports[0];p.start();p.postMessage("ready");p.onmessage=()=>p.postMessage("pong");};',
      );
    else
      res.end(
        '<!doctype html><title>Fixture</title><h1>Fixture</h1><input><script>window.fixtureTicks=0;setInterval(()=>window.fixtureTicks++,100);</script>',
      );
  },
);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `https://hibernate.rokko.test:${server.address().port}`;

let browser, client, fixture;
const result = { passed: false };
try {
  browser = await launch('hibernation', [
    '--host-resolver-rules=MAP hibernate.rokko.test 127.0.0.1',
    `--ignore-certificate-errors-spki-list=${pin}`,
  ]);
  client = await connect(browser.browserUrl);
  fixture = await serviceFixture(client, { intercept: false });
  const ui = interfaceDriver(browser);
  result.runtime = await browser.command('Browser.getVersion');
  assert.equal((await ui.state()).preferences.hibernation.hiddenWorkspaces, true);
  async function add(name, global = false) {
    await ui.activate('Home');
    await ui.activate('Aggiungi applicazione');
    await ui.activate('Servizio personalizzato');
    await ui.fill('#app-name', name);
    await ui.fill('#app-url', origin + '/' + name);
    if (global) await ui.select('#app-workspace', 'global');
    await ui.activate('Aggiungi applicazione');
    const page = await fixture.ready(origin + '/' + name);
    await eventually(
      () =>
        ui.run(
          `document.querySelector('[data-app-id][aria-current=page]')?.getAttribute('aria-label')===${JSON.stringify(name)}`,
        ),
      'selected ' + name,
    );
    return { page, id: (await ui.state()).activeAppId };
  }
  const first = await add('First');
  await fixture.evaluate(
    first.page.session,
    'document.cookie="hibernation=kept;Path=/;Secure;SameSite=Lax;Max-Age=3600"',
  );
  const second = await add('Second');
  const global = await add('Global', true);
  const startWorkers = async (page) => {
    await fixture.evaluate(
      page.session,
      'navigator.serviceWorker.register("/sw.js").then(()=>navigator.serviceWorker.ready).then(()=>{window.workerReady=true;setInterval(()=>{const channel=new MessageChannel();navigator.serviceWorker.controller?.postMessage("ping",[channel.port2]);},200);});window.shared=new SharedWorker("/shared.js");window.shared.port.onmessage=()=>window.sharedReady=true;window.shared.port.start();',
    );
    await eventually(
      () => fixture.evaluate(page.session, 'window.workerReady&&window.sharedReady'),
      'workers ready',
    );
  };
  await startWorkers(first.page);
  await startWorkers(global.page);
  const targets = (await client.send('Target.getTargets')).targetInfos;
  const sharedContext = targets.find((t) => t.targetId === first.page.id).browserContextId;
  const globalContext = targets.find((t) => t.targetId === global.page.id).browserContextId;
  assert.ok(sharedContext && globalContext && sharedContext !== globalContext);

  const badge = (id) =>
    ui.run(`document.querySelector('[data-app-id="${id}"]')?.dataset.serviceStatus`);
  assert.equal(await badge(first.id), 'running');
  assert.equal(await badge(global.id), 'running');
  assert.equal(
    await ui.run(`document.querySelector('[data-app-id="${first.id}"] .service-status') === null`),
    true,
  );
  await ui.activate('Home');
  await ui.focus('[role=switch]');
  await ui.key(' ');
  await eventually(async () => {
    const state = await ui.state();
    return (
      state.suspendedIds.includes(first.id) &&
      state.suspendedIds.includes(second.id) &&
      !state.loadedIds.includes(first.id) &&
      !state.loadedIds.includes(second.id)
    );
  }, 'hidden services closed');
  assert.equal((await ui.state()).suspendedIds.includes(global.id), false);
  assert.equal(
    (await client.send('Target.getTargets')).targetInfos.filter(
      (t) => t.type === 'page' && t.url.startsWith(origin + '/'),
    ).length,
    1,
  );
  await eventually(
    async () =>
      !(await client.send('Target.getTargets')).targetInfos.some(
        (t) =>
          t.browserContextId === sharedContext &&
          ['service_worker', 'shared_worker'].includes(t.type),
      ),
    'workspace workers released',
  );
  assert.ok(
    (await client.send('Target.getTargets')).targetInfos.some(
      (t) => t.browserContextId === globalContext && t.type === 'service_worker',
    ),
  );
  result.sharedWorkersReleased = true;
  result.hiddenWorkspaceRule = true;
  await ui.focus('[role=switch]');
  await ui.key(' ');
  await eventually(async () => !(await ui.state()).suspendedIds.includes(first.id), 'unhidden');
  const restored = await fixture.ready(origin + '/First');
  assert.ok(
    (await fixture.evaluate(restored.session, 'document.cookie')).includes('hibernation=kept'),
  );
  await eventually(() => badge(first.id).then((value) => value === 'running'), 'resumed badge');
  result.sessionsPreserved = true;
  await ui.activate('First');
  await ui.activate('Controlli del servizio');
  await ui.activate('Configura ibernazione');
  await ui.heading('Ibernazione dei servizi · First');
  await ui.activate('Aggiungi regola automatica');
  assert.equal(await ui.run(`document.querySelector('[id^="scope-"]') === null`), true);
  await ui.select('.hibernation-condition select', 'outside-workspace');
  await ui.activate('Salva modifiche');
  await eventually(
    async () => (await ui.state()).preferences.hibernation.rules.length === 1,
    'saved rule',
  );
  await ui.activate('Home');
  await ui.activate('Nuovo workspace');
  await ui.fill('#workspace-name', 'Away');
  await ui.activate('Crea workspace');
  await eventually(
    async () => (await ui.state()).suspensionReasons?.[first.id]?.kind === 'rule',
    'custom workspace rule',
  );
  await eventually(() => badge(first.id).then((value) => value === 'suspended'), 'suspended badge');
  await ui.activate('First');
  await fixture.ready(origin + '/First');
  await eventually(
    () => badge(first.id).then((value) => value === 'running'),
    'click wakes automatically',
  );
  result.rulesAndBadges = true;
  assert.equal((await ui.state()).preferences.hibernation.rules[0].scope.id, first.id);
  result.perServiceAdvancedRules = true;
  await ui.activate('Controlli del servizio');
  await ui.activate('Iberna');
  assert.equal((await ui.state()).suspensionReasons[first.id].kind, 'manual');
  await ui.activate('Impostazioni');
  await ui.activate('Ibernazione dei servizi');
  await ui.activate('Rimuovi regola');
  await ui.activate('Salva modifiche');
  assert.ok((await ui.state()).suspendedIds.includes(first.id));
  await ui.activate('First');
  await ui.activate('Riprendi servizio');
  await fixture.ready(origin + '/First');
  result.manualIndependent = true;
  await ui.activate('Controlli del servizio');
  await ui.activate('Modifica applicazione');
  await ui.activate('Configura ibernazione');
  await ui.heading('Ibernazione dei servizi · First');
  await ui.focus('input[type=checkbox]');
  await ui.key(' ');
  await ui.fill('input[type=number]', '1');
  await ui.activate('Salva modifiche');
  await eventually(
    async () => (await ui.state()).preferences.hibernation.rules[0]?.conditions[0]?.minutes === 1,
    'one minute rule',
  );
  await browser.screenshot();
  await ui.activate('Global');
  await writeFile(
    join(output, 'progress.json'),
    JSON.stringify({ stage: 'waiting for the real one-minute inactivity deadline' }),
  );
  await eventually(
    async () => (await ui.state()).suspensionReasons[first.id]?.kind === 'rule',
    'actual inactivity deadline',
    75000,
  );
  await eventually(() => badge(first.id).then((value) => value === 'suspended'), 'idle badge');
  assert.ok(!(await ui.state()).suspendedIds.includes(second.id));
  assert.ok(!(await ui.state()).suspendedIds.includes(global.id));
  result.realInactivityTimer = true;
  result.perServiceInactivity = true;
  await ui.activate('Home');
  await ui.focus('[role=switch]');
  await ui.key(' ');
  await eventually(
    async () => (await ui.state()).preferences.hiddenWorkspaces.includes('personal'),
    'hidden at shutdown',
  );
  await fixture.detach();
  client.close();
  await browser.stop();
  fixture = client = browser = undefined;
  browser = await launch('restart', [
    '--host-resolver-rules=MAP hibernate.rokko.test 127.0.0.1',
    `--ignore-certificate-errors-spki-list=${pin}`,
  ]);
  client = await connect(browser.browserUrl);
  fixture = await serviceFixture(client, { intercept: false });
  const restart = interfaceDriver(browser);
  await eventually(async () => {
    const state = await restart.state();
    return state.suspendedIds.includes(first.id) && state.suspendedIds.includes(second.id);
  }, 'hidden workspace stays suspended after restart');
  assert.equal((await restart.state()).preferences.hibernation.rules[0].conditions[0].minutes, 1);
  assert.ok(!(await restart.state()).loadedIds.includes(first.id));
  result.restartPolicy = true;
  await browser.screenshot();
  result.passed = true;
} catch (error) {
  try {
    await writeFile(
      join(output, 'failure.json'),
      JSON.stringify(
        {
          state: await browser.evaluate('window.rokko.getSnapshot()'),
          html: await browser.evaluate('document.body.innerText'),
        },
        null,
        2,
      ),
    );
  } catch {}
  throw error;
} finally {
  await fixture?.detach();
  client?.close();
  await browser?.stop();
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(config, { recursive: true, force: true });
}
console.log(JSON.stringify(result, null, 2));
