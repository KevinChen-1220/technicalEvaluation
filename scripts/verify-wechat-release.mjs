import { readFileSync } from 'node:fs';

const args = parseArgs(process.argv.slice(2));
const file = args.file;
const mode = args.mode ?? 'development';

if (!file) {
  fail(['--file is required']);
}
if (mode !== 'development' && mode !== 'production') {
  fail([`Unsupported mode: ${mode}`]);
}

const disclosure = JSON.parse(readFileSync(file, 'utf8'));
const required = [
  'productVersion',
  'privacyPolicyVersion',
  'serviceOperator',
  'modelDisclosure',
  'generativeAiRegistration',
  'miniProgramFiling',
  'reportRoute',
  'privacyRoute',
];
const missing = required.filter((field) => !isNonEmpty(disclosure[field]));

if (mode === 'production') {
  const placeholders = required.filter((field) => disclosure[field] === '待配置');
  if (missing.length > 0 || placeholders.length > 0) {
    fail([...missing, ...placeholders].map((field) => `${field} is required for production`));
  }
}

if (mode === 'development' && missing.length > 0) {
  fail(missing.map((field) => `${field} is required`));
}

process.stdout.write(`release disclosure ${mode} verification passed\n`);

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (key === '--file' || key === '--mode') {
      parsed[key.slice(2)] = values[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function isNonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function fail(messages) {
  process.stderr.write(`${messages.join('\n')}\n`);
  process.exit(1);
}
