import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, syncDesign, startDesignSync } from './sync.mjs';

export { root, syncDesign, startDesignSync, structureHash } from './sync.mjs';
export { attached } from './client.mjs';
export { componentCss, paletteFromVariables } from './styles.mjs';
export { figcraftPlugin } from './vite-plugin.mjs';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(await readFile(resolve(root, 'figcraft.config.json'), 'utf8'));
  if (process.argv.includes('--watch')) {
    const stop = startDesignSync(config);
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.once(signal, () => {
        stop();
        process.exit(0);
      });
  } else {
    try {
      await syncDesign(config);
      console.log('[FigCraft] Synchronized.');
    } catch (e) {
      console.error(e.message);
      process.exitCode = 1;
    }
  }
}
