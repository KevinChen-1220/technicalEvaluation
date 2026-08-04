import { listAssessments, type AssessmentRepository } from '../../server/assessment/service';
import { toPublicAssessmentError } from '../../server/assessment/publicError';
import { getAssessmentReadDependencies } from '../../server/runtime';
import { getTrustedWeChatContext } from '../../server/trustedContext';

export function createMain(dependencies: { repository: AssessmentRepository }) {
  return async (event: unknown, _context: unknown): Promise<unknown> => {
    try {
      return await listAssessments(event, getTrustedWeChatContext(), dependencies);
    } catch (error) {
      return toPublicAssessmentError(error);
    }
  };
}

export async function main(event: unknown, context: unknown): Promise<unknown> {
  try {
    return await createMain(getAssessmentReadDependencies())(event, context);
  } catch (error) {
    return toPublicAssessmentError(error);
  }
}
