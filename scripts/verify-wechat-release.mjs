import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const args = parseArgs(process.argv.slice(2));
const file = args.file;
const mode = args.mode ?? 'development';
const dist = args.dist;

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

if (disclosure.environment !== mode) {
  fail([`release disclosure environment must be ${mode}`]);
}

if (mode === 'production') {
  const placeholders = required.filter((field) => isPlaceholder(disclosure[field]));
  if (missing.length > 0 || placeholders.length > 0) {
    fail([...missing, ...placeholders].map((field) => `${field} is required for production`));
  }
  if (!dist) fail(['--dist is required for production']);
  verifyBuiltDisclosure(dist, disclosure, required);
}

if (mode === 'development' && missing.length > 0) {
  fail(missing.map((field) => `${field} is required`));
}

process.stdout.write(`release disclosure ${mode} verification passed\n`);

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (key === '--file' || key === '--mode' || key === '--dist') {
      parsed[key.slice(2)] = values[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function isNonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlaceholder(value) {
  return typeof value !== 'string'
    || /待配置|\b(?:tbd|todo|example|placeholder|changeme)\b/i.test(value.trim());
}

function verifyBuiltDisclosure(directory, disclosure, fields) {
  const packagedText = readableFiles(directory)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  if (/待配置|\\u5f85\\u914d\\u7f6e/i.test(packagedText)) {
    fail(['dist contains a release disclosure placeholder']);
  }
  const absent = fields.filter((field) => !packagedText.includes(disclosure[field]));
  if (absent.length > 0) {
    fail(absent.map((field) => `dist does not contain matching ${field}`));
  }
}

function readableFiles(directory) {
  const paths = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) paths.push(...readableFiles(path));
    else if (['.js', '.json', '.wxml', '.wxss', '.map', '.txt'].includes(extname(path))) paths.push(path);
  }
  return paths;
}

function fail(messages) {
  process.stderr.write(`${messages.join('\n')}\n`);
  process.exit(1);
}
