import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyFormalPreflight } from './wechat-release-validation.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const args = parseArgs(process.argv.slice(2));

verifyFormalPreflight({ repoRoot, disclosureFile: args['disclosure-file'] });
process.stdout.write('formal release preflight passed; full release verification was not run\n');
process.stdout.write('external blockers recorded\n');

function parseArgs(values) {
  let disclosureFile;
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (key !== '--disclosure-file') fail(`Unsupported formal preflight argument: ${key}`);
    if (disclosureFile !== undefined) fail('Duplicate formal preflight argument: --disclosure-file');
    const value = values[index + 1];
    if (value === undefined || value.startsWith('--')) fail('Missing value for formal preflight argument: --disclosure-file');
    disclosureFile = value;
    index += 1;
  }
  if (disclosureFile === undefined) fail('--disclosure-file is required for formal preflight');
  return { 'disclosure-file': disclosureFile };
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
