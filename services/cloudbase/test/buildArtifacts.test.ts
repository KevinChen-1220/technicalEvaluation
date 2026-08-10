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
        triggers?: Array<{ name: string; type: string; config: string }>;
      }>;
    };

    expect(config.functionRoot).toBe('.');
    expect(config.functions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'get-user-settings',
        dir: './get-user-settings',
        handler: 'index.main',
        timeout: 15,
      }),
      expect.objectContaining({
        name: 'update-user-settings',
        dir: './update-user-settings',
        handler: 'index.main',
        timeout: 15,
      }),
      expect.objectContaining({
        name: 'create-report',
        dir: './create-report',
        handler: 'index.main',
        timeout: 15,
      }),
      expect.objectContaining({
        name: 'generation-worker',
        dir: './generation-worker',
        handler: 'index.main',
        timeout: 600,
        triggers: [{
          name: 'generation-worker-every-minute',
          type: 'timer',
          config: '0 */1 * * * * *',
        }],
      }),
      expect.objectContaining({
        name: 'retention-cleanup',
        dir: './retention-cleanup',
        handler: 'index.main',
        timeout: 120,
        triggers: [{
          name: 'daily-retention-cleanup',
          type: 'timer',
          config: '0 0 3 * * * *',
        }],
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
    expect(generationWorkerBudget.leaseDurationMs).toBeGreaterThan(60_000);
    expect(worker?.timeout).toBeLessThanOrEqual(900);
  });

  test('deploys the compound index used by stale-draft retention', () => {
    const indexes = JSON.parse(readFileSync(join(serviceRoot, 'database', 'indexes.json'), 'utf8')) as {
      indexes?: unknown[];
    };

    expect(indexes.indexes).toEqual(expect.arrayContaining([
      {
        collection: 'assessments',
        name: 'status_updated_at',
        keys: [
          { field: 'status', order: 1 },
          { field: 'updatedAt', order: 1 },
        ],
      },
    ]));
  });
});
