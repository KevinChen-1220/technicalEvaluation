import {
  runRetentionCleanup,
  type RetentionDependencies,
} from '../../server/retention/service';
import { getRetentionDependencies } from '../../server/runtime';

export function createMain(dependencies: RetentionDependencies) {
  return async (_event: unknown, _context: unknown): Promise<unknown> => {
    try {
      return await runRetentionCleanup(dependencies);
    } catch {
      return { errorCode: 'INTERNAL_ERROR' };
    }
  };
}

export async function main(event: unknown, context: unknown): Promise<unknown> {
  return createMain(getRetentionDependencies())(event, context);
}
