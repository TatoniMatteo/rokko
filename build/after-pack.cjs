const { copyFile, chmod } = require('node:fs/promises');
const { join } = require('node:path');

module.exports = async context => {
  if (context.electronPlatformName !== 'linux') return;
  const launcher = join(context.appOutDir, 'AppRun');
  // The AppImage target copies this directory over its generated staging launcher.
  await copyFile(join(context.packager.projectDir, 'build/AppRun'), launcher);
  await chmod(launcher, 0o755);
};
