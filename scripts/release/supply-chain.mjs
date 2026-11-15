import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function inventory(groups, allowed) {
  if (!groups || typeof groups !== 'object' || Array.isArray(groups))
    throw Error('Invalid license inventory');
  const components = new Map();
  for (const [license, packages] of Object.entries(groups)) {
    if (!allowed.includes(license) || !Array.isArray(packages))
      throw Error('Unreviewed license: ' + license);
    for (const pkg of packages) {
      if (
        typeof pkg.name !== 'string' ||
        !/^(@[a-z\d._-]+\/)?[a-z\d._-]+$/i.test(pkg.name) ||
        !Array.isArray(pkg.versions) ||
        !pkg.versions.length
      )
        throw Error('Invalid package inventory');
      for (const version of pkg.versions) {
        if (typeof version !== 'string' || !/^[\w.+-]+$/.test(version))
          throw Error('Invalid package version');
        const purl =
          'pkg:npm/' +
          pkg.name.split('/').map(encodeURIComponent).join('/') +
          '@' +
          encodeURIComponent(version);
        const previous = components.get(purl);
        if (previous && previous.license !== license) throw Error('Conflicting package licenses');
        components.set(purl, { name: pkg.name, version, purl, license });
      }
    }
  }
  if (!components.size) throw Error('Empty license inventory');
  return [...components.values()].sort((a, b) => a.purl.localeCompare(b.purl));
}
async function generate() {
  const output = resolve(process.argv[2] ?? 'dist/security');
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const policy = JSON.parse(
    await readFile(new URL('./license-policy.json', import.meta.url), 'utf8'),
  );
  const list = (args) =>
    JSON.parse(
      execFileSync('corepack', ['pnpm', 'licenses', 'list', '--json', ...args], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      }),
    );
  const allGroups = list([]),
    runtimeGroups = list(['--prod']);
  const all = inventory(allGroups, policy.allowed),
    runtime = new Set(inventory(runtimeGroups, policy.allowed).map((p) => p.purl));
  const notices = [];
  for (const packages of Object.values(runtimeGroups))
    for (const item of packages) {
      let license;
      for (const directory of item.paths ?? []) {
        for (const filename of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md']) {
          try {
            license = await readFile(join(directory, filename), 'utf8');
            break;
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
        }
        if (license) break;
      }
      if (!license) throw Error('Missing runtime license text: ' + item.name);
      notices.push(item.name + ' ' + item.versions.join(', ') + '\n' + license);
    }
  const lockHash = createHash('sha256')
    .update(await readFile('pnpm-lock.yaml'))
    .digest('hex');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const dirty = Boolean(
    execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  );
  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    version: 1,
    metadata: {
      component: {
        type: 'application',
        name: pkg.name,
        version: pkg.version,
        licenses: [{ expression: pkg.license }],
      },
      properties: [
        { name: 'rokko:lockfile:sha256', value: lockHash },
        { name: 'rokko:commit', value: commit },
        { name: 'rokko:working-copy', value: String(dirty) },
      ],
    },
    components: all.map((item) => ({
      'bom-ref': item.purl,
      type: 'library',
      name: item.name,
      version: item.version,
      purl: item.purl,
      scope: runtime.has(item.purl) ? 'required' : 'excluded',
      licenses: [{ expression: item.license }],
      properties: [{ name: 'rokko:build-only', value: String(!runtime.has(item.purl)) }],
    })),
  };
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n\n-----\n\n') + '\n');
  await writeFile(join(output, 'sbom.cdx.json'), JSON.stringify(sbom, null, 2) + '\n');
  await writeFile(
    join(output, 'licenses.json'),
    JSON.stringify(
      {
        lockfileSha256: lockHash,
        commit,
        dirty,
        packages: all.map((p) => ({ ...p, buildOnly: !runtime.has(p.purl) })),
        limits: policy.note,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `Reviewed ${all.length} installed package versions (${runtime.size} runtime); reports: ${output}`,
  );
}
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await generate();
