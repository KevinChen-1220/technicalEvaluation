import { getTrustedWeChatContext } from '../../server/trustedContext';
import {
  createReport,
  type CreateReportDependencies,
} from '../../server/reports/service';
import { getReportDependencies } from '../../server/runtime';

export function createMain(dependencies: CreateReportDependencies) {
  return async (event: unknown, _context: unknown): Promise<unknown> => {
    try {
      return await createReport(event, getTrustedWeChatContext(), dependencies);
    } catch {
      return { errorCode: 'INTERNAL_ERROR' };
    }
  };
}

export async function main(event: unknown, context: unknown): Promise<unknown> {
  return createMain(getReportDependencies())(event, context);
}
