import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generationWorkerBudget } from '../server/generation/worker';

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
    const requiredWorkerBudgetMs = generationWorkerBudget.maxProviderCalls
      * generationWorkerBudget.providerCallTimeoutMs
      + generationWorkerBudget.minimumColdStartAndDatabaseMarginMs;
    expect(generationWorkerBudget.maxProviderCalls
      * generationWorkerBudget.providerCallTimeoutMs).toBeLessThanOrEqual(400_000);
    expect(generationWorkerBudget.minimumColdStartAndDatabaseMarginMs)
      .toBeGreaterThanOrEqual(120_000);
    expect((worker?.timeout ?? 0) * 1000).toBeGreaterThanOrEqual(requiredWorkerBudgetMs);
    expect(generationWorkerBudget.providerCallTimeoutMs)
      .toBeLessThan(generationWorkerBudget.leaseDurationMs);
    expect(worker?.timeout).toBeLessThanOrEqual(900);
  });
});
