import { getStore } from '@edgeone/pages-blob';
import type { BlobPort } from '../storage/ports';

export type EdgeOneEnvironment = Record<string, string | undefined>;

export interface EdgeOneContext {
  request: Request;
  env: EdgeOneEnvironment;
  blob: BlobPort;
}

interface EdgeOneBlobStore {
  get(key: string, options?: { type?: 'json'; consistency?: 'eventual' | 'strong' }): Promise<unknown | null>;
  setJSON(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; directories?: boolean }): Promise<{
    blobs?: Array<{ key?: string } | string>;
    directories?: string[];
  }>;
}

export function createEdgeOneContext(request: Request, env: EdgeOneEnvironment = process.env): EdgeOneContext {
  return {
    request,
    env,
    blob: createBlobPort(getStore('skillscope') as EdgeOneBlobStore),
  };
}

export function createBlobPort(store: EdgeOneBlobStore): BlobPort {
  return {
    async get<T>(key: string, options?: { consistency?: 'eventual' | 'strong' }) {
      return await store.get(key, {
        type: 'json',
        ...(options?.consistency === undefined ? {} : { consistency: options.consistency }),
      }) as T | null;
    },
    async put<T>(key: string, value: T) {
      await store.setJSON(key, value);
    },
    async delete(key: string) {
      await store.delete(key);
    },
    async list(prefix?: string) {
      const result = await store.list({
        ...(prefix === undefined ? {} : { prefix }),
        directories: true,
      });
      return {
        blobs: (result.blobs ?? []).map((blob) => typeof blob === 'string' ? blob : blob.key ?? ''),
        directories: result.directories ?? [],
      };
    },
  };
}
