import { createEdgeOneContext, type EdgeOneEnvironment } from '../../src/platform/context';
import { createGenerationRoute } from '../../src/routes/generation';

export async function onRequest({ request, env }: { request: Request; env: EdgeOneEnvironment }): Promise<Response> {
  return await createGenerationRoute(request, createEdgeOneContext(request, env));
}
