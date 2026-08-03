export type SafeGenerationErrorCode =
  | 'INVALID_REQUEST'
  | 'QUOTA_EXCEEDED'
  | 'PROVIDER_ERROR'
  | 'INVALID_MODEL_RESPONSE'
  | 'CONFIGURATION_ERROR'
  | 'INTERNAL_ERROR';

export class GenerationServiceError extends Error {
  constructor(
    readonly code: SafeGenerationErrorCode,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'GenerationServiceError';
  }
}

export function asGenerationServiceError(error: unknown): GenerationServiceError {
  return error instanceof GenerationServiceError
    ? error
    : new GenerationServiceError('INTERNAL_ERROR', false);
}
