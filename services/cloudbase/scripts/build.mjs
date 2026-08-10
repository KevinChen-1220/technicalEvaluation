import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const serviceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = join(serviceRoot, 'dist');
const functions = [
  'create-generation-job',
  'get-generation-job',
  'get-assessment',
  'update-assessment',
  'list-assessments',
  'complete-assessment',
  'get-user-settings',
  'update-user-settings',
  'create-report',
  'generation-worker',
  'retention-cleanup',
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
  const configPath = join(sourceDirectory, 'config.json');
  if (await exists(configPath)) {
    await copyFile(configPath, join(outputDirectory, 'config.json'));
  }
}

await copyFile(join(serviceRoot, 'deploy', 'cloudbaserc.json'), join(outputRoot, 'cloudbaserc.json'));

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}
