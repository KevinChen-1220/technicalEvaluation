import { createEdgeOneContext } from '../../src/platform/context';
import { createHealthRoute } from '../../src/routes/health';

export async function onRequest({ request }: { request: Request }): Promise<Response> {
  return createHealthRoute(request, createEdgeOneContext(request));
}
