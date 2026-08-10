import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const serviceRoot = join(__dirname, '..');

describe('assessment deployment artifacts', () => {
  beforeAll(() => {
    execFileSync(process.execPath, [join(serviceRoot, 'scripts', 'build.mjs')], {
      cwd: join(serviceRoot, '..', '..'),
    });
  });

  test('every bundled function that requires wx-server-sdk declares the pinned runtime dependency', () => {
    const config = JSON.parse(readFileSync(join(serviceRoot, 'dist', 'cloudbaserc.json'), 'utf8')) as {
      functions: Array<{ name: string }>;
    };
    for (const { name } of config.functions) {
    const directory = join(serviceRoot, 'dist', name);
    expect(existsSync(join(directory, 'index.js'))).toBe(true);
      const bundle = readFileSync(join(directory, 'index.js'), 'utf8');
      const packageJson = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
      };
      if (bundle.includes('require("wx-server-sdk")')) {
        expect(packageJson.dependencies?.['wx-server-sdk']).toBe('4.0.2');
      }
    }
  });

  test('includes both assessment functions in deploy configuration', () => {
    const config = JSON.parse(readFileSync(join(serviceRoot, 'dist', 'cloudbaserc.json'), 'utf8')) as {
      functions: Array<{ name: string; timeout: number }>;
    };
    expect(config.functions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'get-assessment', timeout: 15 }),
      expect.objectContaining({ name: 'update-assessment', timeout: 15 }),
      expect.objectContaining({ name: 'list-assessments', timeout: 15 }),
      expect.objectContaining({ name: 'complete-assessment', timeout: 15 }),
    ]));
  });
});
