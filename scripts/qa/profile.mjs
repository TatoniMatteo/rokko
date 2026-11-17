import { interfaceDriver } from './interface-driver.mjs';
import { serviceCatalog } from '../../src/shared/services/service-catalog.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createRuntime } from './runtime.mjs';
import { connect } from './cdp.mjs';
import { serviceFixture, eventually } from './service-fixture.mjs';
import { readDatabase } from '../../src/main/storage/database.mjs';
import { emptyProfile } from '../../src/main/storage/profile-state.mjs';

process.env.ROKKO_PROFILE_QA = '1';
const { launch, config, output } = await createRuntime('.codex/tasks/profile-qa');
const directory = join(config, 'rokko');
await mkdir(directory, { recursive: true, mode: 0o700 });
const legacy = emptyProfile();
legacy.data.workspaces = [
  { id: 'a', name: 'Workspace A' },
  { id: 'b', name: 'Workspace B' },
];
legacy.data.selectedWorkspaceId = 'a';
legacy.preferences.hibernation.rules = []; // This suite opens services; startup behavior has separate coverage.
legacy.data.apps = [
  ['p1', 'a', false],
  ['p2', 'a', false],
  ['s1', 'a', true],
  ['s2', 'a', true],
  ['s3', 'b', true],
  ['global', null, false],
].map(([id, workspaceId, shared]) => ({
  id,
  name: id,
  url: `https://login.rokko.test/${id}`,
  workspaceId,
  partition: shared ? `persist:rokko-workspace-${workspaceId}` : `persist:rokko-${id}`,
}));
legacy.preferences.cardOrder = ['a', 'global', 'b'];
await writeFile(join(directory, 'rokko-state.json'), JSON.stringify(legacy.data));
await writeFile(join(directory, 'rokko-preferences.json'), JSON.stringify(legacy.preferences));
let browser, client, fixture;
const result = { passed: false };
const run = (expression) => browser.evaluate(expression);
const state = () => run('window.rokko.getSnapshot()');
async function open(phase) {
  browser = await launch(phase, ['--proxy-server=http://127.0.0.1:9']);
  client = await connect(browser.browserUrl);
  fixture = await serviceFixture(client);
}
async function stop() {
  await fixture?.detach();
  fixture = undefined;
  client?.close();
  client = undefined;
  await browser?.stop();
  browser = undefined;
}
async function click(label) {
  await run(
    `(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)});if(!button)throw Error('Missing '+${JSON.stringify(label)});button.click()})()`,
  );
}
async function show(id) {
  await run(`document.querySelector('[data-app-id="${id}"]').click()`);
  await eventually(async () => (await state()).activeAppId === id, 'selected app');
  const { session } = await fixture.ready('https://login.rokko.test/' + id);
  return { evaluate: (expression) => fixture.evaluate(session, expression) };
}
async function update(id, changes) {
  const app = (await state()).data.apps.find((app) => app.id === id);
  return run(
    `window.rokko.updateApp(${JSON.stringify(id)},${JSON.stringify({ name: app.name, url: app.url, workspaceId: app.workspaceId, icon: app.icon, notificationOrigin: app.notificationOrigin, ...changes })})`,
  );
}
async function cancelExternalRequest(url) {
  const request = await eventually(
    async () => (await state()).externalLinkRequests?.find((item) => item.url === url),
    'external link confirmation',
  );
  assert.ok(
    (await client.send('Target.getTargets')).targetInfos.every((target) => target.url !== url),
  );
  await run(
    `window.rokko.resolveExternalLinkRequest(${JSON.stringify(request.id)},"cancel")`,
  );
  await eventually(
    async () =>
      !(await state()).externalLinkRequests?.some((item) => item.id === request.id),
    'external link cancellation',
  );
}
try {
  await open('migration');
  result.runtime = await browser.command('Browser.getVersion');
  assert.deepEqual((await state()).data, legacy.data);
  result.migration = true;
  const initialPages = (await client.send('Target.getTargets')).targetInfos.filter(
    (t) => t.type === 'page',
  ).length;
  assert.equal(initialPages, 1);
  await click('Aggiungi applicazione');
  await eventually(() => run('Boolean(document.querySelector(".service-grid"))'), 'catalog');
  assert.equal(await run('document.querySelectorAll(".service-card").length'), serviceCatalog.templates.length + 1);
  assert.equal(await run('document.querySelectorAll(".catalog-group").length'),10);
  await writeFile(join(output,'catalog.png'),Buffer.from((await browser.command('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await interfaceDriver(browser).fill('#catalog-search','Proton');
  await eventually(()=>run('document.querySelectorAll(".service-card").length===4'),'catalog search across categories');
  assert.equal(await run('document.querySelectorAll(".custom-service").length'),1);
  await interfaceDriver(browser).fill('#catalog-search','');
  await eventually(()=>run(`document.querySelectorAll(".service-card").length===${serviceCatalog.templates.length+1}`),'catalog search reset');
  assert.equal(
    (await client.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page').length,
    initialPages,
  );
  result.catalogLazy = true;
  await click('Home');
  const p1 = await show('p1');
  await p1.evaluate(
    'document.cookie="login=privateA;Path=/;Secure;SameSite=Lax;Max-Age=3600";document.getElementById("message").value="draft"',
  );
  const p2 = await show('p2');
  assert.equal(await p2.evaluate('document.cookie'), '');
  await p2.evaluate('document.cookie="login=privateB;Path=/;Secure;SameSite=Lax;Max-Age=3600"');
  const s1 = await show('s1');
  assert.equal(await s1.evaluate('document.cookie'), '');
  await s1.evaluate('document.cookie="login=sharedA;Path=/;Secure;SameSite=Lax;Max-Age=3600"');
  const s2 = await show('s2');
  assert.ok((await s2.evaluate('document.cookie')).includes('sharedA'));
  const s3 = await show('s3');
  assert.equal(await s3.evaluate('document.cookie'), '');
  await s3.evaluate('document.cookie="login=sharedB;Path=/;Secure;SameSite=Lax;Max-Age=3600"');
  const global = await show('global');
  assert.equal(await global.evaluate('document.cookie'), '');
  assert.equal(await global.evaluate('typeof window.rokko'), 'undefined');
  assert.equal(await p1.evaluate('document.getElementById("message").value'), 'draft');
  result.isolation = true;
  await update('p2', { shareWorkspaceSession: true });
  const joined = await show('p2');
  assert.ok((await joined.evaluate('document.cookie')).includes('sharedA'));
  await update('p2', { shareWorkspaceSession: false });
  const privateAgain = await show('p2');
  assert.ok((await privateAgain.evaluate('document.cookie')).includes('privateB'));
  result.profileSwitchPreservesCookies = true;
  await update('p2', { workspaceId: 'b' });
  await update('s2', { workspaceId: 'b' });
  assert.ok((await (await show('p2')).evaluate('document.cookie')).includes('privateB'));
  assert.ok((await (await show('s2')).evaluate('document.cookie')).includes('sharedB'));
  result.transferSessions = true;
  const previous = (await state()).data;
  assert.equal(
    await run('window.rokko.removeWorkspace("b","missing").then(()=>false,()=>true)'),
    true,
  );
  assert.deepEqual((await state()).data, previous);
  await run('window.rokko.removeWorkspace("a","b")');
  assert.equal((await state()).data.workspaces.length, 1);
  assert.equal(await run('window.rokko.removeWorkspace("b","b").then(()=>false,()=>true)'), true);
  assert.equal((await state()).data.apps.find((a) => a.id === 'global').workspaceId, null);
  await run('window.rokko.moveApp("p2","s2",true)');
  await show('p2');
  result.workspaceIntegrity = true;
  const custom = (
    await run(
      'window.rokko.addApp({name:"Custom site",url:"custom.rokko.test/path",workspaceId:null})',
    )
  ).activeAppId;
  await fixture.ready('https://custom.rokko.test/path');
  assert.equal(
    (await state()).data.apps.find((a) => a.id === custom).url,
    'https://custom.rokko.test/path',
  );
  await show('p2');
  await eventually(
    () =>
      run(`document.querySelector('[data-app-id="${custom}"] .service-icon')?.textContent==='C'`),
    'custom icon fallback',
  );
  result.customAndFallback = true;
  const remote = await show('p2');
  await remote.evaluate('location.href="http://blocked.rokko.test/"');
  await cancelExternalRequest('http://blocked.rokko.test/');
  await fixture.ready('https://login.rokko.test/p2');
  await run('window.rokko.reload()');
  await fixture.ready('https://login.rokko.test/p2');
  result.navigationPolicy = true;
  const redirectPage = await fixture.ready('https://login.rokko.test/p2');
  await fixture.evaluate(redirectPage.session, 'location.href="/redirect-http"');
  await cancelExternalRequest('http://blocked.rokko.test/');
  await run('window.rokko.reload()');
  const recoveredPage = await fixture.ready('https://login.rokko.test/p2');
  assert.equal(
    await fixture.evaluate(recoveredPage.session, 'window.open("file:///etc/passwd") === null'),
    true,
  );
  result.redirectAndPopupPolicy = true;
  await click('Impostazioni');
  await click('Esporta configurazione');
  await eventually(
    () => run('document.body.innerText.includes("Configurazione esportata")'),
    'export',
  );
  const exportDir = join(
    config,
    'export',
    (await readdir(join(config, 'export'))).find((name) => name.startsWith('rokko-export-')),
  );
  const exported = JSON.parse(await readFile(join(exportDir, 'rokko-state.json'), 'utf8'));
  const expected = await state();
  const { activeAppId: _active, ...exportedData } = exported;
  assert.deepEqual(exportedData, expected.data);
  assert.equal(exported.activeAppId, 'p2');
  assert.ok(!JSON.stringify(exported).includes('privateB'));
  assert.ok(!JSON.stringify(exported).includes('sharedA'));
  result.currentExport = true;
  await show('p2');
  await stop();
  assert.equal(readDatabase(join(directory, 'rokko.sqlite')).activeAppId, 'p2');
  await open('restart');
  await run('window.rokko.reload()');
  const resumed = await fixture.ready('https://login.rokko.test/p2');
  assert.equal((await state()).activeAppId, 'p2');
  assert.ok((await state()).data.apps.some((app) => app.id === custom));
  assert.ok((await fixture.evaluate(resumed.session, 'document.cookie')).includes('privateB'));
  result.restartContextAndCookies = true;
  await stop();
  const backup = readDatabase(join(directory, 'rokko.previous.sqlite'));
  await writeFile(join(directory, 'rokko.sqlite'), 'corrupt fixture');
  await open('recovery');
  assert.equal((await state()).recovery.kind, 'corrupt');
  await click('Ripristina la configurazione precedente');
  await eventually(async () => !(await state()).recovery, 'restored');
  assert.deepEqual((await state()).data, backup.data);
  assert.ok((await (await show('p2')).evaluate('document.cookie')).includes('privateB'));
  result.recoveryKeepsCookies = true;
  await stop();
  const path = join(directory, 'rokko.sqlite');
  let db = new DatabaseSync(path);
  db.exec('PRAGMA user_version=99');
  db.close();
  const bytes = await readFile(path);
  await open('future');
  assert.equal((await state()).recovery.kind, 'future');
  assert.equal(await run('window.rokko.recoverProfile("new").then(()=>false,()=>true)'), true);
  await stop();
  assert.deepEqual(await readFile(path), bytes);
  result.futureUntouched = true;
  // Simulate a JSON-only installation with no SQLite database or backup.
  await rm(path);
  await rm(join(directory, 'rokko.previous.sqlite'));
  await writeFile(join(directory, 'rokko-state.json'), '{');
  await open('invalid-legacy');
  assert.equal((await state()).recovery.kind, 'legacy');
  await click('Inizia una nuova configurazione');
  await click('Archivia e ricomincia');
  await eventually(async () => !(await state()).recovery, 'fresh configuration');
  assert.equal((await state()).data.apps.length, 0);
  result.explicitRecovery = true;
  await browser.screenshot();
  assert.deepEqual(fixture.errors, []);
  result.passed = true;
  console.log(JSON.stringify(result, null, 2));
} finally {
  await stop();
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
  await rm(config, { recursive: true, force: true });
}
