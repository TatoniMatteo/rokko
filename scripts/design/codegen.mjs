import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attached } from './client.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const config = JSON.parse(await readFile(resolve(root, 'figcraft.config.json'), 'utf8'));
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const ids = value('--id', '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
if (!ids.length || ids.some((id) => !/^\d+$/.test(id))) {
  throw new Error('Usage: pnpm design:code -- --id <frame-id[,frame-id...]> [--out <directory>]');
}
const document = resolve(root, process.env.FIGCRAFT_DOCUMENT || config.document);
const outputDir = resolve(root, value('--out', '.codex/tasks/figcraft-react-codegen'));
if (!outputDir.startsWith(`${root}/`)) throw new Error('Output directory must be inside the project');

function fileBase(code, id) {
  const name = code.match(/export function ([A-Za-z_$][\w$]*)\s*\(/)?.[1] || `FigCraft${id}`;
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

async function writeAtomic(path, content) {
  const temp = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temp, content);
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}

const sourceHash = createHash('sha256').update(await readFile(document)).digest('hex');
await attached(process.env.FIGCRAFT_PORT || config.port, async (call) => {
  const state = await call('inspect_document', { document, depth: 0, fields: [] });
  if (state.dirty) throw new Error('Save the FigCraft document before generating React code');

  const artifacts = [];
  for (const id of ids) {
    const result = await call('run_command', {
      document,
      command: 'inspect.code',
      params: { id: Number(id), language: 'react' },
    });
    if (!result.code) throw new Error(`FigCraft returned no React code for layer ${id}`);

    const base = fileBase(result.code, id);
    const cssMarker = result.code.match(/\n\/\* ([^*]+\.css) \*\/\n/);
    let component = result.code;
    let css;
    if (cssMarker) {
      const markerIndex = cssMarker.index;
      component = result.code.slice(0, markerIndex).trimEnd() + '\n';
      css = result.code.slice(markerIndex + cssMarker[0].length);
      const cssImport = `import "./${cssMarker[1]}";`;
      if (!component.includes(cssImport))
        throw new Error(`Generated stylesheet import does not match ${cssMarker[1]}`);
    }
    const prefix = `// Generated from FigCraft layer ${id}; edit the design and regenerate.\n`;
    const tsxPath = resolve(outputDir, `${base}.tsx`);
    const imports = new Set(
      [...component.matchAll(/import\s+(?:\{([^}]+)\}|([\w$]+))\s+from\s+["'][^"']+["']/g)]
        .flatMap((match) => (match[1] ? match[1].split(',') : [match[2]]))
        .map((name) => name.trim().split(/\s+as\s+/).at(-1)),
    );
    const definitions = new Set(
      [...component.matchAll(/export\s+function\s+([A-Za-z_$][\w$]*)/g)].map((match) => match[1]),
    );
    const unresolved = [
      ...new Set([...component.matchAll(/<([A-Z][A-Za-z0-9_$]*)\b/g)].map((match) => match[1])),
    ].filter((name) => !imports.has(name) && !definitions.has(name));
    artifacts.push({
      id,
      name: base,
      connected: Boolean(result.connected),
      tsxPath,
      tsx: prefix + component,
      cssPath: css === undefined ? null : resolve(outputDir, cssMarker[1]),
      css,
      unresolved,
    });
  }

  const finalState = await call('inspect_document', { document, depth: 0, fields: [] });
  const finalHash = createHash('sha256').update(await readFile(document)).digest('hex');
  if (finalState.dirty || finalHash !== sourceHash)
    throw new Error('FigCraft changed during generation; save again and regenerate');

  if (new Set(artifacts.map((artifact) => artifact.name)).size !== artifacts.length)
    throw new Error('Selected layers generate duplicate React component names');
  await mkdir(outputDir, { recursive: true });
  for (const artifact of artifacts) {
    await writeAtomic(artifact.tsxPath, artifact.tsx);
    if (artifact.css !== undefined) await writeAtomic(artifact.cssPath, artifact.css);
  }
  console.log(
    JSON.stringify(
      {
        sourceHash,
        generated: artifacts.map(({ id, name, connected, tsxPath, cssPath, unresolved }) => ({
          id,
          name,
          connected,
          tsxPath,
          cssPath,
          unresolved,
        })),
      },
      null,
      2,
    ),
  );
});
