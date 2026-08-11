import { success } from '../http/envelope';
import type { EdgeOneContext } from '../platform/context';
import { failure } from '../http/envelope';

export async function createHealthRoute(_request: Request, context: EdgeOneContext): Promise<Response> {
  if (_request.method !== 'GET') return failure('METHOD_NOT_ALLOWED', false, 405);
  return success({
    service: 'skillscope-edgeone',
    version: context.env.EDGEONE_DEPLOYMENT_VERSION ?? 'unknown',
    generationEnabled: context.env.GENERATION_ENABLED === 'true',
  });
}
