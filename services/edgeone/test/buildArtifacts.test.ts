import { execFileSync, execSync } from 'node:child_process';
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
      cloudFunctions?: { nodejs?: { maxDuration?: number } };
      headers?: Array<{ source?: string; headers?: Array<{ key?: string; value?: string }> }>;
    };

    expect(config.cloudFunctions?.nodejs?.maxDuration).toBe(120);
    expect(config.headers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: '/api/*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      }),
    ]));
    for (const relativePath of [
      ['api', 'health.js'],
      ['api', 'session.js'],
      ['api', 'generation.js'],
      ['api', 'settings.js'],
      ['api', 'reports.js'],
      ['api', 'assessments', '[[path]].js'],
    ]) {
      expect(existsSync(join(serviceRoot, 'cloud-functions', ...relativePath))).toBe(true);
    }
  });

  test('packages deployable functions while excluding TypeScript tests', () => {
    const output = execSync('npm pack --dry-run --json --workspace @dynamic-assessment/edgeone', {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    const packed = JSON.parse(output) as Array<{ files: Array<{ path: string }> }>;
    const paths = packed[0]?.files.map((file) => file.path) ?? [];

    expect(paths).toContain('cloud-functions/api/health.js');
    expect(paths).toContain('cloud-functions/api/generation.js');
    expect(paths).toContain('cloud-functions/api/assessments/[[path]].js');
    expect(paths).not.toContain('test/buildArtifacts.test.ts');
    expect(paths.every((path) => !path.startsWith('node-functions/'))).toBe(true);
  });
});
