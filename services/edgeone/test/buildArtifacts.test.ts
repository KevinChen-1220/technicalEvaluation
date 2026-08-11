import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const serviceRoot = join(__dirname, '..');
const repositoryRoot = join(serviceRoot, '..', '..');

describe('EdgeOne deployment artifacts', () => {
  test('declares the Cloud Function timeout and bundles the health route', () => {
    execFileSync(process.execPath, [join(serviceRoot, 'scripts', 'build.mjs')], {
      cwd: repositoryRoot,
    });

    const config = JSON.parse(readFileSync(join(serviceRoot, 'edgeone.json'), 'utf8')) as {
      cloudFunctions?: { maxDuration?: number };
      headers?: Array<{ source?: string; headers?: Array<{ key?: string; value?: string }> }>;
    };

    expect(config.cloudFunctions?.maxDuration).toBe(120);
    expect(config.headers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: '/api/*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      }),
    ]));
    expect(existsSync(join(serviceRoot, 'dist', 'cloud-functions', 'api', 'health.js'))).toBe(true);
  });
});
