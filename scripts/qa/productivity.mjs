import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createRuntime } from './runtime.mjs';
import { connect } from './cdp.mjs';
import { serviceFixture, eventually } from './service-fixture.mjs';
import { interfaceDriver } from './interface-driver.mjs';

process.env.ROKKO_PROFILE_QA = '1';
const { launch, config, output } = await createRuntime('.codex/tasks/productivity-qa');
let browser, client, fixture;
const uiFallback = () => browser.evaluate('document.body.innerText');
const result = { passed: false };
try {
  browser = await launch('productivity');
  client = await connect(browser.browserUrl);
  fixture = await serviceFixture(client);
  const ui = interfaceDriver(browser);
  result.runtime = await browser.command('Browser.getVersion');
  for (const [name, url] of [
    ['Alpha', 'https://alpha.rokko.test/'],
    ['Beta', 'https://beta.rokko.test/'],
  ]) {
    await ui.activate('Home');
    await ui.activate('Aggiungi applicazione');
    await ui.activate('Servizio personalizzato');
    await ui.fill('#app-name', name);
    await ui.fill('#app-url', url);
    await ui.activate('Aggiungi applicazione');
    await fixture.ready(url);
  }
  const beta = await fixture.ready('https://beta.rokko.test/');
  await eventually(
    () =>
      ui.run(
        'document.querySelector("[data-app-id][aria-current=page]")?.getAttribute("aria-label")==="Beta"',
      ),
    'selected Beta',
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
  await fixture.evaluate(beta.session, 'document.querySelector("input").value="private draft"');
  const control = JSON.parse(await readFile(join(config, 'reliability-control.json'), 'utf8'));
  const native = async (command) => {
    const response = await fetch(`http://127.0.0.1:${control.port}`, {
      method: 'POST',
      headers: { 'x-qa-key': control.key },
      body: JSON.stringify(command),
    });
    assert.ok(response.ok);
    return response.json();
  };
  const status = await native({ action: 'status' });
  const target = status.contents.find((w) => w.url === 'https://beta.rokko.test/');
  await native({ action: 'shortcut', id: target.id });
  await ui.heading('Ricerca rapida');
  await eventually(() => ui.run('document.activeElement?.id==="quick-search"'), 'search focus');
  await ui.fill('#quick-search', 'Alpha');
  assert.equal(await ui.run('document.querySelectorAll("[role=option]").length'), 1);
  assert.ok(
    !(await ui.run('document.querySelector(".quick-switch").textContent')).includes(
      'private draft',
    ),
  );
  await ui.key('Enter');
  await eventually(async () => {
    const state = await ui.state();
    return state.data.apps.find((a) => a.id === state.activeAppId)?.name === 'Alpha';
  }, 'switch from search');
  await ui.activate('Ricerca rapida');
  await ui.fill('#quick-search', 'nothing matches');
  assert.equal(await ui.run('document.querySelectorAll("[role=option]").length'), 0);
  await ui.key('Escape');
  await eventually(() => ui.run('!document.querySelector("#quick-search")'), 'search closed');
  assert.equal(
    await fixture.evaluate(beta.session, 'document.querySelector("input").value'),
    'private draft',
  );
  result.quickSwitch = true;
  assert.equal(
    (await client.send('Target.getTargets')).targetInfos.filter((t) =>
      t.url.endsWith('.rokko.test/'),
    ).length,
    2,
  );
  result.noExtraViews = true;
  const snapshot = await ui.state();
  const alpha = snapshot.data.apps.find((a) => a.name === 'Alpha'),
    betaService = snapshot.data.apps.find((a) => a.name === 'Beta');
  await ui.activate('Controlli del servizio');
  await ui.select('#split-service', betaService.id);
  await ui.activate('Alpha');
  await eventually(async () => {
    const s = await native({ action: 'status' });
    return s.attached.filter((v) => s.contents.some((c) => c.id === v.id)).length === 2;
  }, 'two attached service views');
  const layout = await native({ action: 'status' });
  const panes = layout.attached.filter((v) => layout.contents.some((c) => c.id === v.id));
  assert.equal(panes.length, 2);
  assert.ok(panes[0].bounds.x + panes[0].bounds.width <= panes[1].bounds.x);
  await ui.focus('[role=separator]');
  await ui.key('ArrowRight');
  await eventually(
    async () => Math.abs((await ui.state()).preferences.split.ratio - 0.55) < 0.001,
    'persisted split ratio',
  );
  result.splitViews = true;
  await ui.activate('Controlli del servizio');
  await ui.activate('Silenzia servizio');
  await eventually(
    async () =>
      (await native({ action: 'status' })).contents.find(
        (w) => w.url === 'https://alpha.rokko.test/',
      )?.muted,
    'native mute',
  );
  assert.ok(
    !(await native({ action: 'status' })).contents.find((w) => w.url === 'https://beta.rokko.test/')
      .muted,
  );
  const alphaPage = await fixture.ready('https://alpha.rokko.test/');
  await fixture.evaluate(
    alphaPage.session,
    'document.cookie="safe=kept;Secure;Path=/;SameSite=Lax";localStorage.setItem("safe","kept")',
  );
  await ui.activate('Svuota cache HTTP');
  await ui.activate('Conferma');
  assert.ok((await fixture.evaluate(alphaPage.session, 'document.cookie')).includes('safe=kept'));
  assert.equal(await fixture.evaluate(alphaPage.session, 'localStorage.getItem("safe")'), 'kept');
  await ui.activate('Reimposta permessi del servizio');
  await ui.activate('Conferma');
  await ui.activate('Alpha');
  const newAlpha = await fixture.ready('https://alpha.rokko.test/');
  assert.ok((await fixture.evaluate(newAlpha.session, 'document.cookie')).includes('safe=kept'));
  assert.equal(
    await fixture.evaluate(beta.session, 'document.querySelector("input").value'),
    'private draft',
  );
  result.serviceControls = true;
  await ui.activate('Impostazioni');
  await ui.activate('Importa ed esporta');
  await ui.activate('Salva file di configurazione');
  const exported = await eventually(async () => {
    try {
      return JSON.parse(await readFile(join(config, 'qa-files/configuration.json'), 'utf8'));
    } catch {
      return null;
    }
  }, 'configuration file');
  assert.ok(!JSON.stringify(exported).includes('partition'));
  assert.ok(!JSON.stringify(exported).includes('notificationOrigin'));
  await ui.activate('Scegli file di configurazione');
  await eventually(
    () => ui.run('document.querySelector("#configuration-duplicates")!==null'),
    'import preview',
  );
  await ui.activate('Conferma importazione');
  await eventually(
    () => ui.run('document.body.innerText.includes("Importati 0; saltati 2.")'),
    'idempotent import',
  );
  assert.equal((await ui.state()).data.apps.length, 2);
  const invalid = structuredClone(exported);
  invalid.services[0].url = 'file:///etc/passwd';
  const before = (await ui.state()).data;
  assert.equal(
    await ui.run(
      `window.rokko.importConfiguration(${JSON.stringify(invalid)},{duplicates:'skip',appearance:false}).then(()=>false,()=>true)`,
    ),
    true,
  );
  assert.deepEqual((await ui.state()).data, before);
  result.configurationImportExport = true;
  assert.deepEqual((await native({ action: 'status' })).mainErrors, []);
  await browser.screenshot();
  await fixture.detach();
  client.close();
  await browser.stop();
  fixture = client = browser = undefined;
  browser = await launch('restart');
  client = await connect(browser.browserUrl);
  fixture = await serviceFixture(client);
  const restored = await browser.evaluate('window.rokko.getSnapshot()');
  assert.equal(restored.preferences.split.secondaryId, betaService.id);
  assert.ok(restored.preferences.mutedServices.includes(alpha.id));
  assert.ok(Math.abs(restored.preferences.split.ratio - 0.55) < 0.001);
  result.restartLayout = true;
  result.passed = true;
} catch (error) {
  try {
    await writeFile(
      join(output, 'failure.json'),
      JSON.stringify(
        { html: await uiFallback(), state: await browser.evaluate('window.rokko.getSnapshot()') },
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
  await rm(config, { recursive: true, force: true });
}
console.log(JSON.stringify(result, null, 2));
