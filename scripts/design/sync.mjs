import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import { watch, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { attached } from './client.mjs';
import { componentCss, paletteFromVariables } from './styles.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function structureHash(node) {
  const shape = (n) => ({ type: n.type, children: n.children?.map(shape) ?? [] });
  return createHash('sha256')
    .update(JSON.stringify(shape(node)))
    .digest('hex');
}
export async function syncDesign(config, project = root, { isCurrent = () => true } = {}) {
  const document = resolve(project, process.env.FIGCRAFT_DOCUMENT || config.document);
  const hash = createHash('sha256')
    .update(await readFile(document))
    .digest('hex');
  return attached(process.env.FIGCRAFT_PORT || config.port, async (call) => {
    const state = await call('inspect_document', {
      document,
      allPages: true,
      depth: 8,
      fields: [
        'name',
        'type',
        'x',
        'y',
        'width',
        'height',
        'opacity',
        'cornerRadius',
        'fills',
        'strokes',
        'strokeWeight',
        'boundVariables',
        'fontFamily',
        'fontStyle',
        'fontSize',
        'fontVariations',
        'lineHeight',
        'layout',
      ],
    });
    if (state.dirty) throw new Error('Save the FigCraft document before synchronizing');
    const byId = new Map();
    const visit = (node) => {
      byId.set(node.id, node);
      for (const child of node.children ?? []) visit(child);
    };
    for (const page of state.pages) visit(page);
    const nodes = {};
    for (const [key, id] of Object.entries(config.components)) {
      nodes[key] = byId.get(id);
      if (!nodes[key]) throw new Error(`Missing component ${key}`);
      if (config.structures?.[key] && config.structures[key] !== structureHash(nodes[key]))
        throw new Error(`Structural change in ${key}; update its React component and mapping`);
    }
    const exported = await call('run_command', {
      document,
      command: 'variable.export',
      params: { format: 'json', collections: ['VariableCollectionId:1'] },
    });
    const variables = JSON.parse(exported.text);
    const css = componentCss(nodes, (variables.meta ?? variables).variables);
    const palettes = paletteFromVariables(variables);
    const finalState = await call('inspect_document', { document, depth: 0, fields: [] });
    if (
      finalState.dirty ||
      hash !==
        createHash('sha256')
          .update(await readFile(document))
          .digest('hex')
    )
      throw new Error('Document changed during export; save again');
    if (!isCurrent()) throw new Error('Design watcher was replaced');
    // One module is the atomic snapshot. Vite applies CSS and palettes from the same HMR update.
    const snapshot = JSON.stringify({ css, palettes, sourceHash: hash }, null, 2) + '\n';
    const target = resolve(project, config.output);
    await mkdir(dirname(target), { recursive: true });
    if ((await readFile(target, 'utf8').catch(() => '')) !== snapshot) {
      const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, snapshot);
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    return { document, sourceHash: hash };
  });
}
export function startDesignSync(config, { project = root, log = console.log } = {}) {
  const document = resolve(project, process.env.FIGCRAFT_DOCUMENT || config.document);
  if (!existsSync(document)) {
    log('[FigCraft] Native source not found; using the generated snapshot.');
    return () => {};
  }
  let closed = false,
    timer,
    busy = false,
    again = false,
    lastHash;
  const sync = async () => {
    if (closed) return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      const hash = createHash('sha256')
        .update(await readFile(document))
        .digest('hex');
      if (hash !== lastHash) {
        const result = await syncDesign(config, project, { isCurrent: () => !closed });
        lastHash = result.sourceHash;
        log('[FigCraft] Saved design synchronized.');
      }
    } catch (error) {
      log(`[FigCraft] ${error.message}. Keeping the last valid design.`);
    } finally {
      busy = false;
      if (again && !closed) {
        again = false;
        void sync();
      }
    }
  };
  const watcher = watch(dirname(document), (_event, file) => {
    if (file && String(file) !== basename(document)) return;
    clearTimeout(timer);
    timer = setTimeout(() => void sync(), 200);
  });
  watcher.on('error', (error) => log(`[FigCraft] ${error.message}`));
  void sync();
  return () => {
    closed = true;
    clearTimeout(timer);
    watcher.close();
  };
}
