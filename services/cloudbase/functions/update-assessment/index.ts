import { updateAssessmentAnswers, type AssessmentRepository } from '../../server/assessment/service';
import { toPublicAssessmentError } from '../../server/assessment/publicError';
import { getAssessmentDependencies } from '../../server/runtime';
import { getTrustedWeChatContext } from '../../server/trustedContext';

type Dependencies = {
  repository: AssessmentRepository;
  clock: { now(): Date };
};

export function createMain(dependencies: Dependencies) {
  return async (event: unknown, _context: unknown): Promise<unknown> => {
    try {
      return await updateAssessmentAnswers(event, getTrustedWeChatContext(), dependencies);
    } catch (error) {
      return toPublicAssessmentError(error);
    }
  };
}

export async function main(event: unknown, context: unknown): Promise<unknown> {
  try {
    return await createMain(getAssessmentDependencies())(event, context);
  } catch (error) {
    return toPublicAssessmentError(error);
  }
}
