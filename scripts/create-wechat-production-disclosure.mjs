import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { verifyDisclosure } from './wechat-release-validation.mjs';

const args = parseArgs(process.argv.slice(2));
const output = resolve(args.output ?? 'docs/wechat/release-disclosure.production.json');
const dist = args.dist === undefined ? undefined : resolve(args.dist);
const disclosure = {
  environment: 'production',
  productVersion: args.productVersion,
  privacyPolicyVersion: args.privacyPolicyVersion,
  serviceOperator: args.serviceOperator,
  modelDisclosure: args.modelDisclosure,
  generativeAiRegistration: args.generativeAiRegistration,
  miniProgramFiling: args.miniProgramFiling,
  reportRoute: args.reportRoute ?? '/pages/report/index',
  privacyRoute: args.privacyRoute ?? '/pages/privacy/index',
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(disclosure, null, 2)}\n`);
verifyDisclosure({ file: output, mode: 'production', dist, requireDist: dist !== undefined });
process.stdout.write(`Created production disclosure at ${output}\n`);
process.stdout.write(`Fields: ${Object.keys(disclosure).join(', ')}\n`);

function parseArgs(values) {
  const parsed = {};
  const map = {
    '--output': 'output',
    '--dist': 'dist',
    '--product-version': 'productVersion',
    '--privacy-policy-version': 'privacyPolicyVersion',
    '--service-operator': 'serviceOperator',
    '--model-disclosure': 'modelDisclosure',
    '--generative-ai-registration': 'generativeAiRegistration',
    '--mini-program-filing': 'miniProgramFiling',
    '--report-route': 'reportRoute',
    '--privacy-route': 'privacyRoute',
  };
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    const field = map[key];
    if (field === undefined) fail(`Unsupported production disclosure argument: ${key}`);
    if (parsed[field] !== undefined) fail(`Duplicate production disclosure argument: ${key}`);
    const value = values[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`Missing value for production disclosure argument: ${key}`);
    parsed[field] = value;
    index += 1;
  }
  for (const field of [
    'productVersion',
    'privacyPolicyVersion',
    'serviceOperator',
    'modelDisclosure',
    'generativeAiRegistration',
    'miniProgramFiling',
  ]) {
    if (!hasUsableValue(parsed[field])) fail(`--${toKebab(field)} is required and must not be a placeholder`);
  }
  return parsed;
}

function hasUsableValue(value) {
  return typeof value === 'string'
    && value.trim() !== ''
    && !/待配置|\b(?:tbd|todo|example|placeholder|changeme)\b/i.test(value.trim());
}

function toKebab(value) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
