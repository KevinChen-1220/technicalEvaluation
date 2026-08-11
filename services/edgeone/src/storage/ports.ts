export type BlobConsistency = 'eventual' | 'strong';

export interface BlobReadOptions {
  consistency?: BlobConsistency;
}

export interface BlobWriteOptions {
  onlyIfNew?: boolean;
}

export class BlobPreconditionFailedError extends Error {
  readonly code = 'BLOB_PRECONDITION_FAILED';

  constructor() {
    super('BLOB_PRECONDITION_FAILED');
    this.name = 'BlobPreconditionFailedError';
  }
}

export interface BlobListResult {
  blobs: string[];
  directories: string[];
}

export interface BlobPort {
  get<T>(key: string, options?: BlobReadOptions): Promise<T | null>;
  put<T>(key: string, value: T, options?: BlobWriteOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<BlobListResult>;
}
