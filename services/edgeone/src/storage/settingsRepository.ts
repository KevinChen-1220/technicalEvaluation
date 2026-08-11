import type { BlobPort } from './ports';

export class BlobSettingsRepository<T extends Record<string, unknown> = Record<string, unknown>> {
  constructor(private readonly blob: BlobPort) {}

  async get(ownerKey: string): Promise<T | null> {
    return await this.blob.get<T>(`settings/${encodeURIComponent(ownerKey)}.json`, { consistency: 'strong' });
  }

  async set(ownerKey: string, settings: T): Promise<T> {
    const written = JSON.parse(JSON.stringify(settings)) as T;
    await this.blob.put(`settings/${encodeURIComponent(ownerKey)}.json`, written);
    return written;
  }
}
