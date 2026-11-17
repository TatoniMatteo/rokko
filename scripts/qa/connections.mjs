import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer as httpsServer } from 'node:https';
import { createServer as tcpServer } from 'node:net';
import { execFileSync } from 'node:child_process';
import { writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createRuntime } from './runtime.mjs';
import { connect } from './cdp.mjs';
import { serviceFixture, eventually } from './service-fixture.mjs';
import { interfaceDriver } from './interface-driver.mjs';

process.env.ROKKO_PROFILE_QA = '1';
const { launch, config, output } = await createRuntime('.codex/tasks/connections-qa');
const certificate = join(config, 'test-cert.pem'),
  key = join(config, 'test-key.pem');
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
    certificate,
    '-days',
    '1',
    '-subj',
    '/CN=tls.rokko.invalid',
    '-addext',
    'subjectAltName=DNS:tls.rokko.invalid',
  ],
  { stdio: 'ignore' },
);
const requestLanguages = [];
const tls = httpsServer(
  { key: await readFile(key), cert: await readFile(certificate) },
  (req, res) => {
    requestLanguages.push({ path: req.url, language: req.headers['accept-language'] });
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><title>Language fixture</title><script>window.fixtureTicks=0</script>');
  },
);
const sockets = new Set();
const hanging = tcpServer((socket) => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
});
await new Promise((resolve) => tls.listen(0, '127.0.0.1', resolve));
await new Promise((resolve) => hanging.listen(0, '127.0.0.1', resolve));
let browser, client, fixture;
const result = { passed: false };
try {
  browser = await launch('connections', [
    '--host-resolver-rules=MAP tls.rokko.invalid 127.0.0.1,MAP timeout.rokko.invalid 127.0.0.1',
    '--proxy-bypass-list=tls.rokko.invalid;timeout.rokko.invalid',
  ]);
  client = await connect(browser.browserUrl);
  fixture = await serviceFixture(client);
  const ui = interfaceDriver(browser);
  result.runtime = await browser.command('Browser.getVersion');
  await ui.activate('Aggiungi applicazione');
  await ui.activate('Servizio personalizzato');
  await ui.fill('#app-name', 'Connection fixture');
  await ui.fill('#app-url', 'https://connection.rokko.test/start');
  await ui.activate('Aggiungi applicazione');
  const id = (await ui.state()).activeAppId;
  const startUrl = 'https://connection.rokko.test/start';
  let page = await fixture.ready(startUrl);
  await fixture.evaluate(
    page.session,
    'document.cookie="session=preserved;Path=/;Secure;SameSite=Lax;Max-Age=3600"',
  );
  const partition = (await ui.state()).data.apps.find((a) => a.id === id).partition;
  async function setServiceUrl(url) {
    const app = (await ui.state()).data.apps.find((item) => item.id === id);
    await ui.run(
      `window.rokko.updateApp(${JSON.stringify(id)},${JSON.stringify({
        name: app.name,
        url,
        workspaceId: app.workspaceId,
        icon: app.icon,
        notificationOrigin: app.notificationOrigin,
      })})`,
    );
  }
  await setServiceUrl(`https://tls.rokko.invalid:${tls.address().port}/`);
  await eventually(
    async () => (await ui.state()).appStates[id]?.status === 'failed',
    'real certificate rejection',
  );
  const tlsError = (await ui.state()).appStates[id].error;
  assert.ok(tlsError <= -200 && tlsError >= -299, String(tlsError));
  assert.ok(await ui.run('Boolean(document.querySelector(".service-error[role=alert]"))'));
  result.tlsError = tlsError;
  await ui.activate('Riprova');
  await eventually(
    async () => (await ui.state()).appStates[id]?.status === 'failed',
    'certificate still rejected on retry',
  );
  await setServiceUrl(startUrl);
  page = await fixture.ready(startUrl);
  assert.ok((await fixture.evaluate(page.session, 'document.cookie')).includes('preserved'));
  result.tlsRetryAndRecovery = true;
  const start = performance.now();
  await setServiceUrl(`https://timeout.rokko.invalid:${hanging.address().port}/`);
  await eventually(
    async () => (await ui.state()).appStates[id]?.status === 'failed',
    'real TLS handshake timeout',
    90000,
  );
  const timeout = (await ui.state()).appStates[id].error;
  assert.ok([-7, -118].includes(timeout), String(timeout));
  result.timeoutError = timeout;
  result.timeoutMs = Math.round(performance.now() - start);
  await setServiceUrl(startUrl);
  page = await fixture.ready(startUrl);
  assert.ok((await fixture.evaluate(page.session, 'document.cookie')).includes('preserved'));
  assert.equal((await ui.state()).data.apps.find((a) => a.id === id).partition, partition);
  result.timeoutRecovery = true;
  await fixture.evaluate(page.session, 'location.href="/next"');
  await fixture.ready('https://connection.rokko.test/next');
  await eventually(async () => (await ui.state()).appStates[id]?.canGoBack, 'back enabled');
  await ui.run('window.rokko.goBack()');
  await fixture.ready('https://connection.rokko.test/start');
  await ui.run('window.rokko.goForward()');
  page = await fixture.ready('https://connection.rokko.test/next');
  assert.ok((await fixture.evaluate(page.session, 'document.cookie')).includes('preserved'));
  result.historyAndSession = true;
  const preferences = (await ui.state()).preferences;
  await ui.run(
    `window.rokko.setPreferences(${JSON.stringify({
      ...preferences,
      language: 'en',
      hibernation: { ...preferences.hibernation, rules: [] },
    })})`,
  );
  await fixture.detach();
  client.close();
  await browser.stop();
  fixture = client = browser = undefined;
  const publicKey = execFileSync('openssl', ['x509', '-in', certificate, '-pubkey', '-noout']);
  const der = execFileSync('openssl', ['pkey', '-pubin', '-outform', 'DER'], { input: publicKey });
  const pin = createHash('sha256').update(der).digest('base64');
  // Only this test process trusts this ephemeral fixture key. No production TLS policy changes.
  browser = await launch('languages', [
    '--host-resolver-rules=MAP tls.rokko.invalid 127.0.0.1',
    '--proxy-bypass-list=tls.rokko.invalid',
    `--ignore-certificate-errors-spki-list=${pin}`,
  ]);
  client = await connect(browser.browserUrl);
  fixture = await serviceFixture(client);
  const languageUI = interfaceDriver(browser);
  result.languages = [];
  for (const [name, workspaceId, shareWorkspaceSession] of [
    ['global', null, false],
    ['private', 'personal', false],
    ['shared', 'personal', true],
  ]) {
    const url = `https://tls.rokko.invalid:${tls.address().port}/${name}`;
    await languageUI.run(
      `window.rokko.addApp(${JSON.stringify({ name, url, workspaceId, shareWorkspaceSession })})`,
    );
    const view = await fixture.ready(url);
    assert.ok((await fixture.evaluate(view.session, 'navigator.language')).startsWith('en'));
    const request = requestLanguages.find((request) => request.path === '/' + name);
    assert.ok(request?.language?.startsWith('en'), JSON.stringify(request));
    result.languages.push({ session: name, acceptLanguage: request.language });
  }
  result.passed = true;
} finally {
  await fixture?.detach();
  client?.close();
  await browser?.stop();
  for (const socket of sockets) socket.destroy();
  await Promise.all([
    new Promise((resolve) => tls.close(resolve)),
    new Promise((resolve) => hanging.close(resolve)),
  ]);
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
  await rm(config, { recursive: true, force: true });
}
console.log(JSON.stringify(result, null, 2));
