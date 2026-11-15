import assert from 'node:assert/strict';
import { writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRuntime } from './runtime.mjs';
import { connect } from './cdp.mjs';
import { serviceFixture, eventually } from './service-fixture.mjs';
import { interfaceDriver } from './interface-driver.mjs';

process.env.ROKKO_PROFILE_QA = '1';
const { launch, config, output } = await createRuntime('.codex/tasks/interface-qa');
let browser, client, fixture;
const result = { passed: false, layouts: [] };
async function start(phase) {
  browser = await launch(phase, ['--force-renderer-accessibility']);
  client = await connect(browser.browserUrl);
  fixture = await serviceFixture(client);
  return interfaceDriver(browser);
}
async function stop() {
  await fixture?.detach();
  client?.close();
  await browser?.stop();
  fixture = client = browser = undefined;
}
try {
  let ui = await start('interface');
  result.runtime = await browser.command('Browser.getVersion');
  assert.ok(await ui.run('document.body.innerText.includes("Non serve un account Rokko")'));
  await ui.accessibility();
  result.onboarding = true;
  await ui.activate('Nuovo workspace');
  await ui.fill('#workspace-name', 'Ricerca e progettazione');
  await ui.activate('Crea workspace');
  await eventually(
    async () => (await ui.state()).data.workspaces.length === 2,
    'workspace created',
  );
  const workspaceId = (await ui.state()).data.selectedWorkspaceId;
  await ui.activate('Home');
  await ui.activate('Aggiungi applicazione');
  await ui.activate('Servizio personalizzato');
  await ui.fill('#app-name', 'Discard this draft');
  await ui.activate('Annulla');
  await ui.activate('Esci senza salvare');
  await ui.activate('Servizio personalizzato');
  assert.equal(await ui.run('document.querySelector("#app-name").value'), '');
  await ui.activate('Aggiungi applicazione');
  assert.equal(await ui.run('document.activeElement.id'), 'app-name');
  assert.equal(
    await ui.run('document.querySelector("#app-name").getAttribute("aria-invalid")'),
    'true',
  );
  await ui.fill('#app-name', 'Ricerca');
  await ui.fill('#app-url', 'http://not-allowed.test/');
  await ui.activate('Aggiungi applicazione');
  assert.equal(await ui.run('document.activeElement.id'), 'app-url');
  await ui.fill('#app-url', 'https://interface.rokko.test/first');
  await ui.select('#app-workspace', 'global');
  assert.equal(await ui.run('document.querySelector("#app-shared-session").disabled'), true);
  await ui.select('#app-workspace', workspaceId);
  await ui.focus('.icon-settings summary');
  await ui.key('Enter');
  const { root } = await browser.command('DOM.getDocument');
  const { nodeId } = await browser.command('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '#app-icon',
  });
  await browser.command('DOM.setFileInputFiles', {
    nodeId,
    files: [resolve('assets/brand/rokko-dark-icon.png')],
  });
  await eventually(
    () =>
      ui.run(
        'Boolean(document.querySelector(".icon-preview img")?.src.startsWith("data:image/png"))',
      ),
    'custom icon preview',
  );

  await ui.accessibility();
  await ui.activate('Aggiungi applicazione');
  await fixture.ready('https://interface.rokko.test/first');
  const first = (await ui.state()).activeAppId;
  result.keyboardCreate = true;
  await ui.activate('Impostazioni');
  const saved = (await ui.state()).preferences;
  await ui.select('#theme', 'dark');
  await ui.activate('Verde petrolio');
  await ui.select('#dock-position', 'top');
  await ui.select('#language', 'en');
  await ui.heading('Settings');
  assert.deepEqual((await ui.state()).preferences, saved);
  assert.equal(await ui.run('document.documentElement.lang'), 'en');
  await ui.activate('Home');
  assert.ok(await ui.run('document.body.innerText.includes("Unsaved changes")'));
  await ui.activate('Continue editing');
  await ui.activate('Cancel');
  assert.equal(await ui.run('document.documentElement.lang'), 'it');
  assert.deepEqual((await ui.state()).preferences, saved);
  result.cancelAndGuard = true;
  await ui.select('#theme', 'dark');
  await ui.activate('Verde petrolio');
  await ui.select('#dock-position', 'top');
  await ui.select('#language', 'en');
  await ui.activate('Save changes');
  await eventually(
    async () => (await ui.state()).preferences.language === 'en',
    'saved preferences',
  );
  await eventually(() => ui.run('document.body.innerText.includes("Restart required")'), 'restart notice rendered');
  await ui.activate('Reset theme');
  assert.equal(await ui.run('document.querySelector("#theme").value'), 'system');
  assert.equal(await ui.run('document.querySelector("#language").value'), 'en');
  await ui.activate('Cancel');
  assert.equal(await ui.run('document.querySelector("#theme").value'), 'dark');
  result.themePreview = true;
  await browser.command('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  result.reducedMotion = await ui.run(`(() => {
    const spinner=document.createElement('span'); spinner.className='ui-spinner';
    document.querySelector('.theme-preview').append(spinner);
    const stopped=getComputedStyle(spinner).animationName==='none';spinner.remove();return stopped;
  })()`);
  assert.equal(result.reducedMotion, true);
  for (const dock of ['top', 'bottom', 'left', 'right']) {
    await ui.select('#dock-position', dock);
    for (const theme of ['light', 'dark', 'system']) {
      await ui.select('#theme', theme);
      if (theme === 'system') {
        for (const value of ['light', 'dark']) {
          await browser.command('Emulation.setEmulatedMedia', {
            features: [
              { name: 'prefers-color-scheme', value },
              { name: 'prefers-reduced-motion', value: 'reduce' },
            ],
          });
          await eventually(
            () => ui.run(`document.documentElement.style.colorScheme === '${value}'`),
            'system theme',
          );
        }
      }
      for (const [width, scale] of [
        [820, 1],
        [1280, 1.25],
        [1920, 2],
      ]) {
        await browser.command('Emulation.setDeviceMetricsOverride', {
          width,
          height: 900,
          deviceScaleFactor: scale,
          mobile: false,
        });
        const metrics = await ui.run(`(() => {
          const page=document.querySelector('.settings-page'),grid=document.querySelector('.preference-grid');
          const groups=document.querySelector('.dock-groups'),vertical=['left','right'].includes('${dock}');
          return { overflow:page.scrollWidth-page.clientWidth,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,
            wrongAxis:vertical?groups.scrollWidth-groups.clientWidth:groups.scrollHeight-groups.clientHeight };
        })()`);
        assert.ok(
          metrics.overflow <= 1 && metrics.columns <= 2 && metrics.wrongAxis <= 1,
          JSON.stringify({ dock, theme, width, metrics }),
        );
        result.layouts.push({ dock, theme, width, scale, ...metrics });
      }
      const shot = await browser.command('Page.captureScreenshot', { format: 'png' });
      await writeFile(join(output, `${dock}-${theme}.png`), Buffer.from(shot.data, 'base64'));
    }
  }
  await browser.command('Emulation.clearDeviceMetricsOverride');
  await ui.activate('Cancel');
  result.accessibility = await ui.accessibility();
  await ui.focus('.seed-swatch');
  assert.ok(
    await ui.run(
      'document.activeElement.matches(":focus-visible") && getComputedStyle(document.activeElement).outlineStyle !== "none" && parseFloat(getComputedStyle(document.activeElement).outlineWidth)>0',
    ),
  );
  await ui.activate('Home');
  await ui.activate('Add application');
  await ui.activate('Custom service');
  await ui.fill('#app-name', 'Second service');
  await ui.fill('#app-url', 'https://interface.rokko.test/second');
  await ui.activate('Add application');
  await fixture.ready('https://interface.rokko.test/second');
  const second = (await ui.state()).activeAppId;
  await ui.activate('Home');
  await ui.activate('Reorder Ricerca');
  await ui.key('ArrowDown');
  await eventually(
    async () =>
      (await ui.state()).data.apps.findIndex((a) => a.id === first) >
      (await ui.state()).data.apps.findIndex((a) => a.id === second),
    'keyboard reorder',
  );
  await ui.key(' ');
  result.keyboardReorder = true;
  await ui.activate('All workspaces');
  await ui.activate('Edit workspace Ricerca e progettazione');
  await ui.fill('#workspace-name', 'Research');
  await ui.activate('Save workspace');
  await eventually(
    async () =>
      (await ui.state()).data.workspaces.find((w) => w.id === workspaceId)?.name === 'Research',
    'rename',
  );
  await ui.activate('Edit workspace Research');
  await ui.select('#workspace-destination', 'personal');
  await ui.activate('Transfer applications and remove workspace');
  await eventually(async () => (await ui.state()).data.workspaces.length === 1, 'remove workspace');
  assert.ok((await ui.state()).data.apps.every((a) => a.workspaceId === 'personal'));
  await ui.activate('Home');
  await ui.activate('Configured services');
  await ui.activate('Edit Second service');
  await ui.activate('Remove application');
  await ui.activate('Confirm removal');
  await eventually(async () => (await ui.state()).data.apps.length === 1, 'remove app');
  result.keyboardEditAndRemove = true;
  const expected = (await ui.state()).preferences;
  await stop();
  ui = await start('interface-restart');
  assert.deepEqual((await ui.state()).preferences, expected);
  assert.equal((await ui.state()).browserLanguage, 'en');
  await ui.activate('Ricerca');
  const remote = await fixture.ready('https://interface.rokko.test/first');
  assert.ok((await fixture.evaluate(remote.session, 'navigator.language')).startsWith('en'));
  result.serviceLanguageAfterRestart = true;
  const current = (await ui.state()).preferences;
  assert.equal(
    await ui.run(
      `window.rokko.setPreferences(${JSON.stringify({ ...current, theme: 'invalid' })}).then(()=>false,()=>true)`,
    ),
    true,
  );
  assert.deepEqual((await ui.state()).preferences, current);
  for (let i = 0; i < 19; i++)
    await ui.run(
      `window.rokko.addApp({name:'Overflow ${i}',url:'https://interface.rokko.test/overflow${i}',workspaceId:'personal'})`,
    );
  await browser.command('Page.reload');
  await eventually(
    () => ui.run('document.querySelectorAll(".dock [data-app-id]").length>=20'),
    'crowded dock',
  );
  await ui.activate('Settings');
  for (const dock of ['top', 'bottom', 'left', 'right']) {
    await ui.select('#dock-position', dock);
    await browser.command('Emulation.setDeviceMetricsOverride', {
      width: 820,
      height: 560,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await ui.focus('.dock [data-app-id]:last-child');
    const metrics = await ui.run(
      `(()=>{const g=document.querySelector('.dock-groups'),r=document.activeElement.getBoundingClientRect(),v=['left','right'].includes('${dock}'),b=g.getBoundingClientRect();return {overflow:v?g.scrollWidth-g.clientWidth:g.scrollHeight-g.clientHeight,visible:v?r.top>=b.top&&r.bottom<=b.bottom+1:r.left>=b.left&&r.right<=b.right+1}})()`,
    );
    assert.ok(metrics.overflow <= 1 && metrics.visible, JSON.stringify({ dock, ...metrics }));
    await ui.key(['left', 'right'].includes(dock) ? 'ArrowUp' : 'ArrowLeft');
    assert.ok(await ui.run('document.activeElement.closest(".dock") !== null'));
  }
  result.crowdedDock = true;
  result.passed = true;
} catch (error) {
  if (browser) {
    await browser.screenshot();
    await writeFile(
      join(output, 'failure.html'),
      await browser.evaluate('document.documentElement.outerHTML'),
    );
  }
  throw error;
} finally {
  await stop();
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
  await rm(config, { recursive: true, force: true });
}
console.log(
  JSON.stringify(
    {
      ...result,
      layouts: result.layouts.length,
      accessibility: `${result.accessibility?.length} accessible nodes`,
    },
    null,
    2,
  ),
);
