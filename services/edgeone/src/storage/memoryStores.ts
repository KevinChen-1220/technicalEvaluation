import { createEdgeOneStores, type StoreOptions } from './edgeOneStores';
import { BlobPreconditionFailedError, type BlobListOptions, type BlobListResult, type BlobPort, type BlobReadOptions, type BlobWriteOptions } from './ports';

export class MemoryBlobPort implements BlobPort {
  readonly records = new Map<string, unknown>();

  async get<T>(key: string, _options?: BlobReadOptions): Promise<T | null> {
    return this.records.has(key) ? clone(this.records.get(key) as T) : null;
  }

  async put<T>(key: string, value: T, options?: BlobWriteOptions): Promise<void> {
    if (options?.onlyIfNew && this.records.has(key)) throw new BlobPreconditionFailedError();
    this.records.set(key, clone(value));
  }

  async delete(key: string): Promise<void> { this.records.delete(key); }

  async list(prefix = '', options?: BlobListOptions): Promise<BlobListResult> {
    return { blobs: [...this.records.keys()].filter((key) => key.startsWith(prefix)).sort().slice(0, options?.limit), directories: [] };
  }
}

export function createMemoryStores(options: StoreOptions) {
  return createEdgeOneStores(new MemoryBlobPort(), options);
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
