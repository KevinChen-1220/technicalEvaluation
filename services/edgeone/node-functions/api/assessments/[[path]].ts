import { createEdgeOneContext, type EdgeOneEnvironment } from '../../../src/platform/context';
import { createAssessmentsRoute } from '../../../src/routes/assessments';

export async function onRequest({ request, env }: { request: Request; env: EdgeOneEnvironment }): Promise<Response> {
  return await createAssessmentsRoute(request, createEdgeOneContext(request, env));
}
