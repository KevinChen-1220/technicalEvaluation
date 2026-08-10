import { getTrustedWeChatContext } from '../../server/trustedContext';
import {
  acceptPrivacyPolicy,
  type AcceptPrivacyPolicyDependencies,
} from '../../server/settings/service';
import { getAcceptPrivacyPolicyDependencies } from '../../server/runtime';

export function createMain(dependencies: AcceptPrivacyPolicyDependencies) {
  return async (event: unknown, _context: unknown): Promise<unknown> => {
    try {
      return await acceptPrivacyPolicy(event, getTrustedWeChatContext(), dependencies);
    } catch {
      return { errorCode: 'INTERNAL_ERROR' };
    }
  };
}

export async function main(event: unknown, context: unknown): Promise<unknown> {
  return createMain(getAcceptPrivacyPolicyDependencies())(event, context);
}
