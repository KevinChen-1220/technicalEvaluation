import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export function parseOrigin(value, { requireRoot = false } = {}) {
  try {
    const url = new URL(String(value ?? '').trim());
    if (requireRoot) {
      const isRoot = url.protocol === 'https:'
        && url.username === ''
        && url.password === ''
        && (url.pathname === '' || url.pathname === '/')
        && url.search === ''
        && url.hash === '';
      if (!isRoot) {
        return {
          ok: false,
          message: 'Use an HTTPS origin root such as https://api.example.com, not a URL with /api, query, hash, credentials, or token.',
        };
      }
    }
    return { ok: true, url };
  } catch {
    return {
      ok: false,
      message: 'Candidate request domain must be a valid HTTPS origin root.',
    };
  }
}

export async function inspectDns(parsed, options = {}, okMessage = 'DNS resolves to at least one public address.') {
  if (!parsed.ok) return { ok: false, message: 'DNS check skipped because the API origin is invalid.' };
  if (options.skipNetwork) return { ok: false, skipped: true, message: 'DNS check skipped by --skip-network.' };
  if (options.dnsResult) return inspectResolvedAddresses(splitList(options.dnsResult), okMessage);
  try {
    const records = await lookup(parsed.url.hostname, { all: true });
    return inspectResolvedAddresses(records.map((record) => record.address).filter(Boolean), okMessage);
  } catch {
    return { ok: false, addresses: [], message: 'DNS lookup failed; configure the candidate domain before using it in WeChat.' };
  }
}

export function inspectResolvedAddresses(addresses, okMessage = 'DNS resolves to at least one public address.') {
  const publicAddresses = addresses.filter(isPublicAddress);
  if (addresses.length === 0) return { ok: false, addresses: [], message: 'DNS lookup returned no addresses.' };
  if (publicAddresses.length === 0) {
    return {
      ok: false,
      addresses,
      message: 'DNS resolves only to non-public addresses; WeChat production request domains need a publicly reachable HTTPS origin.',
    };
  }
  return { ok: true, addresses, publicAddresses, message: okMessage };
}

export function isPublicAddress(address) {
  const kind = isIP(address);
  if (kind === 4) return isPublicIpv4(address);
  if (kind === 6) return isPublicIpv6(address);
  return false;
}

export async function inspectHealth(parsed, options = {}) {
  if (!parsed.ok) return { ok: false, message: 'Health check skipped because the API origin is invalid.' };
  if (options.skipNetwork) return { ok: false, skipped: true, message: 'Health check skipped by --skip-network.' };
  if (options.skipHealth) return { ok: false, skipped: true, message: 'Health check skipped by --skip-health.' };
  if (options.healthJson) return inspectHealthBody(parseHealthJson(options.healthJson));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(new URL('/api/health', parsed.url.origin), {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, message: `Health endpoint returned HTTP ${response.status}.` };
    return inspectHealthBody(await response.json());
  } catch {
    return { ok: false, message: 'Health check failed; verify EdgeOne binding, HTTPS certificate, and runtime environment.' };
  } finally {
    clearTimeout(timeout);
  }
}

export function inspectHealthBody(body) {
  if (body?.ok !== true || body?.data?.service !== 'skillscope-edgeone') {
    return { ok: false, message: 'Health endpoint did not return the SkillScope EdgeOne service contract.' };
  }
  if (body.data.configurationReady !== true) {
    return { ok: false, message: 'Health endpoint reports configurationReady=false.' };
  }
  if (typeof body.data.generationEnabled !== 'boolean') {
    return { ok: false, message: 'Health endpoint does not report generationEnabled.' };
  }
  return { ok: true, message: 'Health endpoint returns the SkillScope service contract.' };
}

function isPublicIpv4(address) {
  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51) return false;
  if (a === 203 && b === 0) return false;
  return true;
}

function isPublicIpv6(address) {
  const normalized = address.toLowerCase();
  return !(
    normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80')
    || normalized.startsWith('2001:db8')
  );
}

function splitList(value) {
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function parseHealthJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
