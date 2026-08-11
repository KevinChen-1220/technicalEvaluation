export type BlobConsistency = 'eventual' | 'strong';

export interface BlobReadOptions {
  consistency?: BlobConsistency;
}

export interface BlobListResult {
  blobs: string[];
  directories: string[];
}

export interface BlobPort {
  get<T>(key: string, options?: BlobReadOptions): Promise<T | null>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<BlobListResult>;
}
