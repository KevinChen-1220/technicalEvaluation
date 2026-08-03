import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const serviceRoot = join(__dirname, '..');
const outputRoot = join(serviceRoot, 'dist');

describe('CloudBase deployment artifacts', () => {
  beforeAll(() => {
    execFileSync(process.execPath, [join(serviceRoot, 'scripts', 'build.mjs')], {
      cwd: join(serviceRoot, '..', '..'),
    });
  });

  test('copies a deployable worker timeout comfortably above ten provider calls', () => {
    const config = JSON.parse(readFileSync(join(outputRoot, 'cloudbaserc.json'), 'utf8')) as {
      functionRoot?: string;
      functions?: Array<{
        name?: string;
        dir?: string;
        handler?: string;
        timeout?: number;
      }>;
    };

    expect(config.functionRoot).toBe('.');
    expect(config.functions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'generation-worker',
        dir: './generation-worker',
        handler: 'index.main',
        timeout: 600,
      }),
    ]));
    const worker = config.functions?.find((entry) => entry.name === 'generation-worker');
    expect(worker?.timeout).toBeGreaterThanOrEqual(300);
    expect(worker?.timeout).toBeLessThanOrEqual(900);
  });
});
