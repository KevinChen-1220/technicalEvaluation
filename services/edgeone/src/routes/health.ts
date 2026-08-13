import { success } from '../http/envelope';
import type { EdgeOneContext } from '../platform/context';
import { failure } from '../http/envelope';

const requiredRuntimeEnvNames = [
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

export async function createHealthRoute(_request: Request, context: EdgeOneContext): Promise<Response> {
  if (_request.method !== 'GET') return failure('METHOD_NOT_ALLOWED', false, 405);
  return success({
    service: 'skillscope-edgeone',
    version: context.env.EDGEONE_DEPLOYMENT_VERSION ?? 'unknown',
    configurationReady: requiredRuntimeEnvNames.every((name) => isConfigured(context.env[name])),
    generationEnabled: context.env.GENERATION_ENABLED === 'true',
  });
}

function isConfigured(value: string | undefined): boolean {
  return typeof value === 'string'
    && value.trim() !== ''
    && !/^(?:placeholder|changeme|example|todo|tbd|待配置|replace-)/i.test(value.trim());
}
