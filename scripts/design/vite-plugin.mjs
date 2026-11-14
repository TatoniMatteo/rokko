import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, startDesignSync } from './sync.mjs';

export function figcraftPlugin() {
  let stop;
  return {
    name: 'rokko-figcraft',
    apply: 'serve',
    async configureServer(server) {
      const path = resolve(root, 'figcraft.config.json');
      const start = async () => {
        try {
          const config = JSON.parse(await readFile(path, 'utf8'));
          stop?.();
          stop = startDesignSync(config, { log: (message) => server.config.logger.info(message) });
        } catch (e) {
          server.config.logger.warn(`[FigCraft] ${e.message}`);
        }
      };
      await start();
      server.watcher.add(path);
      server.watcher.on('change', (file) => {
        if (file === path) void start();
      });
      server.httpServer?.once('close', () => stop?.());
    },
    closeBundle() {
      stop?.();
    },
  };
}
