// Privileged test harness only. Not imported or packaged by the product.
const { app, dialog, powerMonitor, webContents, shell, BaseWindow } = require('electron');
const { createServer } = require('node:http');
const { join, basename } = require('node:path');
const { writeFileSync, mkdirSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
if (
  process.env.ROKKO_PROFILE_QA !== '1' ||
  !/^profile-/.test(basename(process.env.XDG_CONFIG_HOME || ''))
)
  throw Error('Isolated QA profile required');
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
if (process.env.ROKKO_QA_X11_SCREEN === '1')
  app.commandLine.appendSwitch('disable-features', 'WebRTCPipeWireCapturer');
const root = process.env.XDG_CONFIG_HOME,
  key = randomUUID(),
  files = join(root, 'qa-files');
mkdirSync(files, { mode: 0o700 });
app.setPath('downloads', files);
writeFileSync(join(files, 'blocker'), 'not a directory');
let downloadMode = 'complete';
const questions = [],
  external = [],
  saveOptions = [];
dialog.showSaveDialog = async () => ({
  canceled: false,
  filePath: join(files, 'diagnostics.json'),
});
dialog.showMessageBox = async (options) => {
  questions.push({ message: options.message, detail: options.detail });
  return { response: 0, checkboxChecked: false };
};
shell.openExternal = async (url) => {
  external.push(url);
};
const mainErrors = [];
process.on('uncaughtException', (error) => {
  mainErrors.push(error.stack);
  process.stderr.write(error.stack + '\n');
});
dialog.showErrorBox = (title, content) => {
  mainErrors.push(title + ': ' + content);
};
const sessions = new WeakSet();
app.on('web-contents-created', (_event, contents) => {
  const ses = contents.session;
  if (sessions.has(ses)) return;
  sessions.add(ses);
  ses.prependListener('will-download', (_e, item) => {
    const setOptions = item.setSaveDialogOptions;
    item.setSaveDialogOptions = (options) => {
      saveOptions.push(options);
      setOptions.call(item, options);
    };
    if (downloadMode !== 'interactive')
      item.setSavePath(
        join(
          files,
          downloadMode === 'invalid' ? 'blocker/file.txt' : 'download-' + randomUUID() + '.bin',
        ),
      );
    if (downloadMode === 'paused') item.pause();
  });
});
const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || req.headers['x-qa-key'] !== key) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 2048) throw Error('size');
    }
    const command = JSON.parse(body);
    let result = {};
    const owned = () =>
      webContents
        .getAllWebContents()
        .filter((w) =>
          /^https:\/\/(linux\.rokko\.test|accounts\.google\.com):\d+\//.test(w.getURL()),
        );
    if (command.action === 'status')
      result = {
        contents: owned().map((w) => ({
          id: w.id,
          url: w.getURL(),
          crashed: w.isCrashed(),
        })),
        attachedIds: BaseWindow.getAllWindows()[0]?.contentView.children.map(
          (view) => view.webContents.id,
        ),
        mainErrors,
        questions,
        external,
        saveOptions,
      };
    else if (command.action === 'resume') powerMonitor.emit('resume');
    else if (command.action === 'crash') {
      const w = owned().find((w) => w.id === command.id);
      if (!w) throw Error('target');
      const pid = w.getOSProcessId();
      if (pid <= 1 || pid === process.pid) throw Error('renderer pid');
      process.kill(pid, 'SIGKILL');
    } else if (
      command.action === 'download-mode' &&
      ['complete', 'paused', 'invalid', 'interactive'].includes(command.mode)
    )
      downloadMode = command.mode;
    else throw Error('action');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(result));
  } catch {
    res.writeHead(400);
    res.end('{}');
  }
});
server.listen(0, '127.0.0.1', () =>
  writeFileSync(
    join(root, 'reliability-control.json'),
    JSON.stringify({ port: server.address().port, key }),
    { mode: 0o600 },
  ),
);
app.on('will-quit', () => server.close());
require('./profile-entry.cjs');
