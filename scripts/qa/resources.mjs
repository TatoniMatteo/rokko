import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createRuntime } from './runtime.mjs';
import { connect } from './cdp.mjs';
import { measure, tree } from './process-resources.mjs';

const { launch, config, output } = await createRuntime('.codex/tasks/resources');
const budgets = JSON.parse(await readFile(new URL('./resource-budgets.json', import.meta.url)));
const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url)));
const result = {
  environment: {
    node: process.version,
    electron: pkg.devDependencies.electron,
    arch: process.arch,
    display: process.env.XDG_SESSION_TYPE,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    workingCopy: Boolean(
      execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
    ),
  },
  resources: [],
  budgets,
  passed: false,
};
const fixture =
  '<h1>Rokko resource fixture</h1><script>window.fixtureTicks=0;setInterval(()=>window.fixtureTicks++,100)</script>';
const sessions = new Map();
const failures = [];
let browser, client;
async function eventually(check, label) {
  const start = performance.now();
  while (performance.now() - start < 10000) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Not ready: ${label}`);
}
async function evaluate(session, expression) {
  const response = await client.send(
    'Runtime.evaluate',
    { expression, returnByValue: true },
    session,
  );
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function serviceSession(url) {
  return eventually(async () => {
    for (const [id, session] of sessions) {
      try {
        if (
          (await evaluate(session, 'location.href')) === url &&
          (await evaluate(session, 'typeof window.fixtureTicks === "number"'))
        )
          return { id, session };
      } catch {
        /* A detached or starting target is not ready yet. */
      }
    }
  }, url);
}
try {
  const start = performance.now();
  browser = await launch('resources', ['--proxy-server=http://127.0.0.1:9']);
  result.startupReadyMs = performance.now() - start;
  client = await connect(browser.browserUrl);
  client.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
    if (targetInfo.type !== 'page') {
      void client
        .send('Runtime.runIfWaitingForDebugger', {}, sessionId)
        .catch((error) => failures.push(error.message));
      return;
    }
    sessions.set(targetInfo.targetId, sessionId);
    void client
      .send('Fetch.enable', { patterns: [{ urlPattern: 'https://*.rokko.test/*' }] }, sessionId)
      .then(() => client.send('Runtime.runIfWaitingForDebugger', {}, sessionId))
      .catch((error) => failures.push(error.message));
  });
  client.on('Target.detachedFromTarget', ({ targetId }) => sessions.delete(targetId));
  client.on('Fetch.requestPaused', ({ requestId }, sessionId) => {
    void client
      .send(
        'Fetch.fulfillRequest',
        {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'content-type', value: 'text/html' }],
          body: Buffer.from(fixture).toString('base64'),
        },
        sessionId,
      )
      .catch((error) => failures.push(error.message));
  });
  await client.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: true,
  });
  result.resources.push({ apps: 0, ...(await measure(browser.pid)) });
  const services = [];
  for (let index = 0; index < 20; index++) {
    const url = `https://resource${index}.rokko.test/`;
    const snapshot = await browser.evaluate(
      `window.rokko.addApp(${JSON.stringify({ name: `Fixture ${index}`, url, notificationOrigin: new URL(url).origin })})`,
    );
    const service = snapshot.data.apps.at(-1);
    await browser.evaluate('window.rokko.setOverlayOpen(false)');
    const { session } = await serviceSession(url);
    services.push({ ...service, session });
    if (services.length === 5 || services.length === 20) {
      // Refresh the real shell so the measured UI includes all configured dock icons.
      await browser.command('Page.reload');
      await eventually(
        () =>
          browser.evaluate(
            `document.querySelectorAll('[data-app-id]').length === ${services.length}`,
          ),
        'configured dock',
      );
      await browser.evaluate(`document.querySelector('[data-app-id="${service.id}"]').click()`);
      result.resources.push({ apps: services.length, ...(await measure(browser.pid)) });
    }
  }
  const heartbeat = await Promise.all(
    services.map((service) => evaluate(service.session, 'window.fixtureTicks')),
  );
  await new Promise((resolve) => setTimeout(resolve, 1500));
  for (const [index, service] of services.entries()) {
    assert.ok(
      (await evaluate(service.session, 'window.fixtureTicks')) > heartbeat[index],
      'Background fixture stopped',
    );
  }
  result.backgroundHeartbeat = true;
  const processCount = (await tree(browser.pid)).length;
  const durations = [];
  for (let index = 0; index < 100; index++)
    durations.push(
      await browser.evaluate(
        `(async()=>{const start=performance.now();await window.rokko.selectApp(${JSON.stringify(services[index % 20].id)});return performance.now()-start;})()`,
      ),
    );
  durations.sort((a, b) => a - b);
  result.switching = {
    count: 100,
    medianIpcMs: durations[50],
    p95IpcMs: durations[94],
    maxIpcMs: durations.at(-1),
  };
  assert.equal((await tree(browser.pid)).length, processCount);
  // Detach before disposal, so instrumentation cannot prevent worker cleanup.
  await client.send('Target.setAutoAttach', {
    autoAttach: false,
    waitForDebuggerOnStart: false,
    flatten: true,
  });
  client.close();
  client = undefined;
  for (const service of services)
    await browser.evaluate(`window.rokko.removeApp(${JSON.stringify(service.id)})`);
  result.resources.push({ apps: 0, phase: 'after-removal', ...(await measure(browser.pid, 3)) });
  assert.deepEqual(failures, []);
  assert.ok(result.startupReadyMs <= budgets.startupReadyMs, 'Startup budget exceeded');
  for (const row of result.resources) {
    assert.notEqual(row.meanPssMiB, null, 'PSS is required; check /proc permissions');
    assert.ok(
      row.meanPssMiB <= budgets.memoryPssMiB[row.apps],
      `${row.apps} apps: memory budget exceeded`,
    );
    assert.ok(
      row.cpuPercentOneCore <= budgets.cpuPercentOneCore[row.apps],
      `${row.apps} apps: CPU budget exceeded`,
    );
  }
  const [baseline] = result.resources;
  const cleaned = result.resources.at(-1);
  assert.equal(
    cleaned.processCount,
    baseline.processCount,
    'Service processes remain after removal',
  );
  assert.ok(
    cleaned.meanPssMiB - baseline.meanPssMiB <= budgets.cleanupPssOverheadMiB,
    'Cleanup memory regression',
  );
  assert.ok(result.switching.p95IpcMs <= budgets.switchP95IpcMs, 'Switching budget exceeded');
  result.passed = true;
  console.log(
    JSON.stringify(
      { ...result, resources: result.resources.map(({ samples: _samples, ...row }) => row) },
      null,
      2,
    ),
  );
} finally {
  client?.close();
  await browser?.stop();
  await writeFile(join(output, 'measurements.json'), JSON.stringify(result, null, 2));
  await rm(config, { recursive: true, force: true });
}
