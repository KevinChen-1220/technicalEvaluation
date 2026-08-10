import { normalizeReleaseDisclosure } from './consent';

export const releaseDisclosure = normalizeReleaseDisclosure(parseInjectedDisclosure(
  process.env.TARO_APP_RELEASE_DISCLOSURE_JSON,
));

function parseInjectedDisclosure(value: string | undefined) {
  if (value === undefined || value.trim() === '') {
    throw new Error('Release disclosure was not injected by the Taro build.');
  }
  try {
    return JSON.parse(value) as Parameters<typeof normalizeReleaseDisclosure>[0];
  } catch {
    throw new Error('Injected release disclosure is invalid.');
  }
}
