import { createEdgeOneContext, type EdgeOneEnvironment } from '../../src/platform/context';
import { createReportsRoute } from '../../src/routes/reports';

export async function onRequest({ request, env }: { request: Request; env: EdgeOneEnvironment }): Promise<Response> {
  return await createReportsRoute(request, createEdgeOneContext(request, env));
}
