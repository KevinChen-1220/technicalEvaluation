import { getStore } from '@edgeone/pages-blob';
import { BlobPreconditionFailedError, type BlobPort } from '../storage/ports';

export type EdgeOneEnvironment = Record<string, string | undefined>;

export interface EdgeOneContext {
  request: Request;
  env: EdgeOneEnvironment;
  blob: BlobPort;
}

interface EdgeOneBlobStore {
  get(key: string, options?: { type?: 'json'; consistency?: 'eventual' | 'strong' }): Promise<unknown | null>;
  setJSON(key: string, value: unknown, options?: { onlyIfNew?: boolean }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; directories?: boolean; consistency?: 'eventual' | 'strong'; limit?: number }): Promise<{
    blobs?: Array<{ key?: string } | string>;
    directories?: string[];
  }>;
}

export function createEdgeOneContext(request: Request, env: EdgeOneEnvironment): EdgeOneContext {
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
    async put<T>(key: string, value: T, options?: { onlyIfNew?: boolean }) {
      try {
        await store.setJSON(key, value, options);
      } catch (error) {
        if (options?.onlyIfNew && isPreconditionFailure(error)) throw new BlobPreconditionFailedError();
        throw error;
      }
    },
    async delete(key: string) {
      await store.delete(key);
    },
    async list(prefix?: string, options?: { consistency?: 'eventual' | 'strong'; limit?: number }) {
      const result = await store.list({
        ...(prefix === undefined ? {} : { prefix }),
        directories: true,
        ...(options?.consistency === undefined ? {} : { consistency: options.consistency }),
        ...(options?.limit === undefined ? {} : { limit: options.limit }),
      });
      return {
        blobs: (result.blobs ?? []).map((blob) => typeof blob === 'string' ? blob : blob.key ?? '').slice(0, options?.limit),
        directories: result.directories ?? [],
      };
    },
  };
}

function isPreconditionFailure(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && (error as { name?: unknown }).name === 'PreconditionFailed';
}
