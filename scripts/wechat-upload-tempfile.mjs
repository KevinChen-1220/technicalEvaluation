import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function withEphemeralPrivateKeyFile(privateKeyPem, callback, options = {}) {
  if (typeof privateKeyPem !== 'string' || privateKeyPem.trim() === '') {
    throw new Error('WECHAT_PRIVATE_KEY_PEM is required for ephemeral upload key creation');
  }
  const directory = mkdtempSync(join(options.tmpRoot ?? tmpdir(), 'wechat-upload-'));
  const privateKeyPath = join(directory, 'private.key');
  try {
    writeFileSync(privateKeyPath, privateKeyPem, { mode: 0o600 });
    try {
      chmodSync(privateKeyPath, 0o600);
    } catch {
      // Windows may not expose POSIX mode bits; the temp directory is still removed below.
    }
    return await callback(privateKeyPath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
