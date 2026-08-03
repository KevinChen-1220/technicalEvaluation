import { MissingTrustedOpenIdError } from '../../shared/errors';

export function toPublicAssessmentError(error: unknown): { errorCode: 'INVALID_REQUEST' | 'INTERNAL_ERROR' } {
  return {
    errorCode: error instanceof MissingTrustedOpenIdError ? 'INVALID_REQUEST' : 'INTERNAL_ERROR',
  };
}
