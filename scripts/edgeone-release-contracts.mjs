export const requiredServerRuntimeEnvNames = [
  'WECHAT_APP_ID',
  'WECHAT_APP_SECRET',
  'SESSION_HMAC_KEY',
  'OWNER_HMAC_KEY',
  'OPENID_ENCRYPTION_KEY',
  'LLM_BASE_URL',
  'LLM_API_KEY',
  'LLM_MODEL',
  'GENERATION_ENABLED',
  'EDGEONE_DEPLOYMENT_VERSION',
];

export function getMissingRequiredRuntimeEnv(environment) {
  return requiredServerRuntimeEnvNames.filter((name) => {
    const value = environment?.[name];
    return typeof value !== 'string'
      || value.trim() === ''
      || /^(?:placeholder|changeme|example|todo|tbd|待配置|replace-)/i.test(value.trim());
  });
}

export function extractHttpsOrigins(output) {
  const origins = new Set();
  for (const match of String(output ?? '').matchAll(/https:\/\/[^\s"'<>),\]]+/gi)) {
    try {
      const url = new URL(match[0]);
      origins.add(url.origin);
    } catch {
      // Ignore non-URL fragments that only look like URLs.
    }
  }
  return [...origins];
}

export function assertDeploymentOrigin(output, expectedOrigin, allowMissingOrigin) {
  const expected = normalizeOrigin(expectedOrigin);
  const origins = extractHttpsOrigins(output);
  if (origins.length === 0) {
    if (allowMissingOrigin) return;
    throw new Error('EdgeOne deployment output did not report a public HTTPS origin.');
  }
  if (origins.length !== 1 || origins[0] !== expected) {
    throw new Error('EdgeOne deployment origin does not match the expected production origin.');
  }
}

export function assertHealthContract(body, expected) {
  if (body?.ok !== true || body?.data?.service !== 'skillscope-edgeone') {
    throw new Error('EdgeOne health response is not the SkillScope service.');
  }
  if (expected.requireVersion && body.data.version !== expected.version) {
    throw new Error('EdgeOne health version does not match the deployment version.');
  }
  if (body.data.configurationReady !== true) {
    throw new Error('EdgeOne runtime configuration is not ready.');
  }
  if (body.data.generationEnabled !== expected.generationEnabled) {
    throw new Error('EdgeOne generation switch does not match the expected value.');
  }
}

export function normalizeOrigin(value) {
  const url = new URL(value);
  return url.origin;
}
