import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDisclosure } from './wechat-release-validation.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const args = parseArgs(process.argv.slice(2));

verifyDisclosure({
  file: resolve(repoRoot, args.file),
  mode: args.mode,
  dist: args.dist === undefined ? undefined : resolve(repoRoot, args.dist),
});
process.stdout.write(`release disclosure ${args.mode} verification passed\n`);

function parseArgs(values) {
  const parsed = {};
  const allowed = new Set(['--file', '--mode', '--dist']);
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!allowed.has(key)) fail(`Unsupported disclosure argument: ${key}`);
    if (parsed[key.slice(2)] !== undefined) fail(`Duplicate disclosure argument: ${key}`);
    const value = values[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`Missing value for disclosure argument: ${key}`);
    parsed[key.slice(2)] = value;
    index += 1;
  }
  if (parsed.file === undefined) fail('--file is required');
  if (parsed.mode === undefined) fail('--mode is required');
  return parsed;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
