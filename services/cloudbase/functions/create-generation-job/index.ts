import { getTrustedWeChatContext } from '../../server/trustedContext';
import {
  createGenerationJob,
  type GenerationJobServiceDependencies,
} from '../../server/generation/jobService';
import { toPublicGenerationError } from '../../server/generation/publicError';
import { getGenerationJobDependencies } from '../../server/runtime';

export function createMain(dependencies: GenerationJobServiceDependencies) {
  return async (event: unknown, _context: unknown): Promise<unknown> => {
    try {
      return await createGenerationJob(event, getTrustedWeChatContext(), dependencies);
    } catch (error) {
      return toPublicGenerationError(error);
    }
  };
}

export async function main(event: unknown, context: unknown): Promise<unknown> {
  try {
    return await createMain(getGenerationJobDependencies())(event, context);
  } catch (error) {
    return toPublicGenerationError(error);
  }
}
