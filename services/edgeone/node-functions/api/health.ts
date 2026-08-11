import { createEdgeOneContext, type EdgeOneEnvironment } from '../../src/platform/context';
import { createHealthRoute } from '../../src/routes/health';

export async function onRequest({ request, env }: {
  request: Request;
  env: EdgeOneEnvironment;
}): Promise<Response> {
  return createHealthRoute(request, createEdgeOneContext(request, env));
}
