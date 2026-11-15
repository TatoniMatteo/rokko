// Test-only entry: isolated profile and deterministic native export destination. Never packaged.
const { app, dialog } = require('electron');
const { join, basename, resolve } = require('node:path');
const { mkdirSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
if (
  process.env.ROKKO_PROFILE_QA !== '1' ||
  !/^profile-/.test(basename(process.env.XDG_CONFIG_HOME || ''))
) {
  throw new Error('Use the isolated qa:profile runner');
}
app.setName('rokko');
app.setPath('userData', join(process.env.XDG_CONFIG_HOME, 'rokko'));
const destination = join(process.env.XDG_CONFIG_HOME, 'export');
mkdirSync(destination, { recursive: true, mode: 0o700 });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [destination] });
import(pathToFileURL(resolve(__dirname, '../../out/main/index.js')).href);
