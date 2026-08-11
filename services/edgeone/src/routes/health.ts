import { success } from '../http/envelope';
import type { EdgeOneContext } from '../platform/context';

export async function createHealthRoute(_request: Request, context: EdgeOneContext): Promise<Response> {
  return success({
    service: 'skillscope-edgeone',
    version: context.env.EDGEONE_DEPLOYMENT_VERSION ?? 'unknown',
    generationEnabled: context.env.GENERATION_ENABLED === 'true',
  });
}
