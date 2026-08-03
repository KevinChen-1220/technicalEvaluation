import { toPublicGenerationError } from '../../server/generation/publicError';
import {
  runGenerationWorker,
  type GenerationWorkerDependencies,
} from '../../server/generation/worker';
import { getGenerationWorkerDependencies } from '../../server/runtime';

export function createMain(dependencies: GenerationWorkerDependencies) {
  return async (_event: unknown, _context: unknown): Promise<unknown> => {
    try {
      return await runGenerationWorker(dependencies);
    } catch (error) {
      return toPublicGenerationError(error);
    }
  };
}

export function createRuntimeMain(
  loadDependencies: () => GenerationWorkerDependencies,
) {
  return async (event: unknown, context: unknown): Promise<unknown> => {
    try {
      return await createMain(loadDependencies())(event, context);
    } catch (error) {
      return toPublicGenerationError(error);
    }
  };
}

export async function main(event: unknown, context: unknown): Promise<unknown> {
  return createRuntimeMain(getGenerationWorkerDependencies)(event, context);
}
