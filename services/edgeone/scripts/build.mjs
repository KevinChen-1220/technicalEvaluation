import { readdir, rm } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const serviceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(serviceRoot, 'node-functions');
const outputRoot = join(serviceRoot, 'cloud-functions');
const entries = await findEntries(sourceRoot);

await rm(outputRoot, { recursive: true, force: true });

await build({
  entryPoints: entries,
  absWorkingDir: serviceRoot,
  outdir: outputRoot,
  outbase: sourceRoot,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: false,
  logLevel: 'warning',
});

async function findEntries(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findEntries(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  }));
  return files.flat().sort((left, right) => relative(sourceRoot, left).localeCompare(relative(sourceRoot, right)));
}
