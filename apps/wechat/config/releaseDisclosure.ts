import { readFileSync } from 'node:fs';
import path from 'node:path';

export type BuildReleaseDisclosure = {
  environment: 'development' | 'production';
  productVersion: string;
  privacyPolicyVersion: string;
  serviceOperator: string;
  modelDisclosure: string;
  generativeAiRegistration: string;
  miniProgramFiling: string;
  reportRoute: string;
  privacyRoute: string;
};

const requiredFields = [
  'productVersion',
  'privacyPolicyVersion',
  'serviceOperator',
  'modelDisclosure',
  'generativeAiRegistration',
  'miniProgramFiling',
  'reportRoute',
  'privacyRoute',
] as const;

export function loadSelectedReleaseDisclosure(
  environment: NodeJS.ProcessEnv = process.env,
): BuildReleaseDisclosure {
  const repositoryRoot = path.resolve(__dirname, '../../..');
  const defaultFile = path.join(repositoryRoot, 'docs/wechat/release-disclosure.development.json');
  const selected = environment.TARO_APP_RELEASE_DISCLOSURE_FILE?.trim();
  const file = selected
    ? (path.isAbsolute(selected) ? selected : path.resolve(repositoryRoot, selected))
    : defaultFile;
  const parsed = parseObject(readFileSync(file, 'utf8'), file);
  const releaseEnvironment = parsed.environment;
  if (releaseEnvironment !== 'development' && releaseEnvironment !== 'production') {
    throw new Error(`Invalid release disclosure environment in ${file}.`);
  }

  const invalid = requiredFields.filter((field) => {
    const value = parsed[field];
    return typeof value !== 'string'
      || value.trim().length === 0
      || (releaseEnvironment === 'production' && isPlaceholder(value));
  });
  if (invalid.length > 0) {
    throw new Error(`Invalid ${releaseEnvironment} release disclosure fields: ${invalid.join(', ')}.`);
  }

  return Object.fromEntries([
    ['environment', releaseEnvironment],
    ...requiredFields.map((field) => [field, (parsed[field] as string).trim()]),
  ]) as BuildReleaseDisclosure;
}

function parseObject(source: string, file: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    throw new Error(`Release disclosure is not valid JSON: ${file}.`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Release disclosure must be a JSON object: ${file}.`);
  }
  return parsed as Record<string, unknown>;
}

function isPlaceholder(value: string): boolean {
  return /待配置|\b(?:tbd|todo|example|placeholder|changeme)\b/i.test(value.trim());
}
