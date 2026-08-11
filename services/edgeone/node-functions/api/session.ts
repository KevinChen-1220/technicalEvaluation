import { createEdgeOneContext, type EdgeOneEnvironment } from '../../src/platform/context';
import { createSessionRoute } from '../../src/routes/session';

export async function onRequest({ request, env }: {
  request: Request;
  env: EdgeOneEnvironment;
}): Promise<Response> {
  return createSessionRoute(request, createEdgeOneContext(request, env), async (url) => fetch(url));
}
