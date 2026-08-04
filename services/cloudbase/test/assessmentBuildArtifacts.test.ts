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

  test.each(['get-assessment', 'update-assessment', 'list-assessments', 'complete-assessment'])('builds the %s function with pinned runtime dependency', (name) => {
    const directory = join(serviceRoot, 'dist', name);
    expect(existsSync(join(directory, 'index.js'))).toBe(true);
    expect(JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))).toMatchObject({
      name,
      dependencies: { 'wx-server-sdk': '4.0.2' },
    });
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
