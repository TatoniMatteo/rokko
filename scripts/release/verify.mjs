import { resolve } from 'node:path';
import { verifyManifest } from './artifacts.mjs';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node scripts/release/verify.mjs ARTIFACT_DIRECTORY');
const manifest = await verifyManifest(resolve(directory));
console.log(`Verified ${manifest.artifacts.length} unsigned Linux ${manifest.arch} artifacts (${manifest.version})`);
