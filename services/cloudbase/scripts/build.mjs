import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const serviceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = join(serviceRoot, 'dist');
const functions = [
  'create-generation-job',
  'get-generation-job',
  'generation-worker',
];

await rm(outputRoot, { recursive: true, force: true });

for (const functionName of functions) {
  const sourceDirectory = join(serviceRoot, 'functions', functionName);
  const outputDirectory = join(outputRoot, functionName);
  await mkdir(outputDirectory, { recursive: true });
  await build({
    entryPoints: [join(sourceDirectory, 'index.ts')],
    outfile: join(outputDirectory, 'index.js'),
    bundle: true,
    external: ['wx-server-sdk'],
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: false,
    logLevel: 'warning',
  });
  await copyFile(join(sourceDirectory, 'package.json'), join(outputDirectory, 'package.json'));
}

await copyFile(join(serviceRoot, 'deploy', 'cloudbaserc.json'), join(outputRoot, 'cloudbaserc.json'));
