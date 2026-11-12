import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function artifactNames(version, arch, targets = ['AppImage', 'deb']) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid version');
  if (!['x64', 'arm64'].includes(arch)) throw new Error('Unsupported Linux architecture');
  if (!targets.length || new Set(targets).size !== targets.length ||
      targets.some(target => !['AppImage', 'deb'].includes(target))) throw new Error('Invalid package targets');
  return targets.map(target => `rokko-${version}-linux-${arch}.${target}`);
}

export async function describeArtifact(directory, name) {
  if (name !== name.split(/[\\/]/).at(-1)) throw new Error('Invalid artifact name');
  const file = join(directory, name);
  const stat = await lstat(file);
  if (!stat.isFile() || !stat.size) throw new Error(`Missing or empty artifact: ${name}`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return { name, size: stat.size, sha256: hash.digest('hex') };
}

export async function writeManifest(directory, metadata, names) {
  const artifacts = await Promise.all(names.map(name => describeArtifact(directory, name)));
  const manifest = { schemaVersion: 1, ...metadata, signed: false, artifacts };
  await writeFile(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(directory, 'SHA256SUMS.txt'),
    artifacts.map(artifact => `${artifact.sha256}  ${artifact.name}\n`).join(''));
  return manifest;
}

export async function verifyManifest(directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.artifacts) || !manifest.artifacts.length) {
    throw new Error('Invalid artifact manifest');
  }
  const expected = artifactNames(manifest.version, manifest.arch, manifest.targets);
  if (manifest.artifacts.length !== expected.length ||
      manifest.artifacts.some((artifact, index) => artifact.name !== expected[index])) {
    throw new Error('Unexpected artifact set');
  }
  const files = (await readdir(directory)).filter(name => /\.(deb|AppImage)$/.test(name)).sort();
  if (JSON.stringify(files) !== JSON.stringify([...expected].sort())) {
    throw new Error('Unexpected packages in artifact directory');
  }
  for (const artifact of manifest.artifacts) {
    const actual = await describeArtifact(directory, artifact.name);
    if (actual.sha256 !== artifact.sha256 || actual.size !== artifact.size) {
      throw new Error(`Artifact integrity failed: ${artifact.name}`);
    }
  }
  const checksums = await readFile(join(directory, 'SHA256SUMS.txt'), 'utf8');
  if (checksums !== manifest.artifacts.map(a => `${a.sha256}  ${a.name}\n`).join('')) {
    throw new Error('Checksum list differs from manifest');
  }
  return manifest;
}
