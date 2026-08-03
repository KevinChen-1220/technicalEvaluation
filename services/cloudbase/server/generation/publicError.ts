import { MissingTrustedOpenIdError } from '../../shared/errors';
import { GenerationServiceError, type SafeGenerationErrorCode } from './errors';

export type PublicGenerationError = { errorCode: SafeGenerationErrorCode };

export function toPublicGenerationError(error: unknown): PublicGenerationError {
  if (error instanceof MissingTrustedOpenIdError) {
    return { errorCode: 'INVALID_REQUEST' };
  }
  if (error instanceof GenerationServiceError) {
    return { errorCode: error.code };
  }
  return { errorCode: 'INTERNAL_ERROR' };
}
