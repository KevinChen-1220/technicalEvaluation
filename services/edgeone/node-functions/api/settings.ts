import { createEdgeOneContext, type EdgeOneEnvironment } from '../../src/platform/context';
import { createSettingsRoute } from '../../src/routes/settings';

export async function onRequest({ request, env }: { request: Request; env: EdgeOneEnvironment }): Promise<Response> {
  return await createSettingsRoute(request, createEdgeOneContext(request, env));
}
