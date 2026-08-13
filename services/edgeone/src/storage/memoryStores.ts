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
    const matches = [...this.records.keys()]
      .filter((key) => key.startsWith(prefix) && (options?.cursor === undefined || key > options.cursor))
      .sort();
    if (options?.directories !== true) {
      const blobs = matches.slice(0, options?.limit);
      const cursor = options?.limit !== undefined && matches.length > blobs.length ? blobs.at(-1) : undefined;
      return { blobs, directories: [], ...(cursor === undefined ? {} : { cursor }) };
    }
    const blobs: string[] = [];
    const directories = new Set<string>();
    for (const key of matches) {
      const suffix = key.slice(prefix.length);
      const separator = suffix.indexOf('/');
      if (separator < 0) blobs.push(key);
      else directories.add(`${prefix}${suffix.slice(0, separator + 1)}`);
    }
    return { blobs: blobs.slice(0, options?.limit), directories: [...directories] };
  }
}

export function createMemoryStores(options: StoreOptions) {
  return createEdgeOneStores(new MemoryBlobPort(), options);
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
