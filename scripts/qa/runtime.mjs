import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

export async function createRuntime(defaultOutput) {
  const { values } = parseArgs({
    options: {
      prepared: { type: 'string' },
      executable: { type: 'string' },
      app: { type: 'string' },
      output: { type: 'string', default: defaultOutput },
      x11: { type: 'boolean', default: false },
    },
  });
  if (values.prepared && values.executable) throw new Error('Choose --prepared or --executable');
  if (values.prepared) {
    const prepared = JSON.parse(await readFile(resolve(values.prepared), 'utf8'));
    values.executable = prepared.executable;
  }
  if (!values.executable)
    throw new Error('Required: --executable PATH [--app ASAR_OR_APPIMAGE] [--x11]');
  const output = resolve(values.output);
  await rm(join(output, 'result.json'), { force: true });
  await mkdir(output, { recursive: true });
  const config = await mkdtemp(join(output, 'profile-'));
  const env = { ...process.env, XDG_CONFIG_HOME: config };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function bounded(promise, label, timeout = 5000) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Timeout: ${label}`)), timeout);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function launch(phase, extraArgs = []) {
    const args = values.app ? [resolve(values.app)] : [];
    args.push(...extraArgs);
    args.push('--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0');
    if (values.x11) args.push('--ozone-platform=x11');
    const child = spawn(resolve(values.executable), args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    let failed;
    let socket;
    let next = 0;
    const waiting = new Map();
    child.on('error', (error) => {
      failed = error;
    });
    child.stdout.on('data', (data) => {
      logs += data;
    });
    child.stderr.on('data', (data) => {
      logs += data;
    });
    const exited = new Promise((resolve) => child.once('close', resolve));
    async function stop() {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ id: ++next, method: 'Browser.close' }));
      }
      try {
        await bounded(exited, 'browser shutdown', 1500);
      } catch {
        child.kill('SIGTERM');
        try {
          await bounded(exited, 'process shutdown', 1500);
        } catch {
          child.kill('SIGKILL');
          await bounded(exited, 'forced shutdown');
        }
      } finally {
        socket?.close();
        await writeFile(join(output, `${phase}.log`), logs);
      }
    }
    try {
      let url;
      for (let i = 0; i < 100; i++) {
        if (failed) throw failed;
        if (child.exitCode !== null || child.signalCode !== null)
          throw new Error(`Browser exited before ready:\n${logs}`);
        const match = logs.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          url = new URL(match[1]);
          break;
        }
        await delay(100);
      }
      assert.ok(url, 'DevTools did not start');
      let target;
      for (let i = 0; i < 100; i++) {
        const pages = await (
          await fetch(`http://127.0.0.1:${url.port}/json/list`, {
            signal: AbortSignal.timeout(2000),
          })
        ).json();
        target = pages.find((page) => page.type === 'page' && page.url.startsWith('file:'));
        if (target) break;
        await delay(100);
      }
      assert.ok(target, 'Packaged local renderer did not load');
      socket = new WebSocket(target.webSocketDebuggerUrl);
      await bounded(
        new Promise((resolve, reject) => {
          socket.addEventListener('open', resolve, { once: true });
          socket.addEventListener('error', reject, { once: true });
        }),
        'DevTools connection',
      );
      socket.addEventListener('message', ({ data }) => {
        const response = JSON.parse(data);
        waiting.get(response.id)?.(response);
      });
      async function command(method, params) {
        const id = ++next;
        const result = new Promise((resolve) => waiting.set(id, resolve));
        socket.send(JSON.stringify({ id, method, params }));
        try {
          const response = await bounded(result, method);
          if (response.error) throw new Error(JSON.stringify(response.error));
          return response.result;
        } finally {
          waiting.delete(id);
        }
      }
      async function evaluate(expression) {
        const result = await command('Runtime.evaluate', {
          expression,
          awaitPromise: true,
          returnByValue: true,
        });
        if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
      }
      let ready = false;
      for (let i = 0; i < 50; i++) {
        ready = await evaluate('Boolean(window.rokko && document.querySelector(".welcome"))');
        if (ready) break;
        await delay(100);
      }
      assert.ok(ready, 'Shell did not become ready');
      assert.equal(await evaluate('document.title'), 'Rokko');
      assert.equal(await evaluate('typeof window.require'), 'undefined');
      assert.equal(await evaluate('typeof window.process'), 'undefined');
      assert.ok(
        await evaluate(
          '[...document.images].some(i => i.alt === "Rokko" && i.complete && i.naturalWidth > 0)',
        ),
      );
      return {
        evaluate,
        stop,
        command,
        browserUrl: url.href,
        pid: child.pid,
        screenshot: async () => {
          const shot = await command('Page.captureScreenshot', { format: 'png' });
          await writeFile(join(output, `${phase}.png`), Buffer.from(shot.data, 'base64'));
        },
      };
    } catch (error) {
      await stop();
      throw error;
    }
  }

  return { launch, config, output, values };
}
