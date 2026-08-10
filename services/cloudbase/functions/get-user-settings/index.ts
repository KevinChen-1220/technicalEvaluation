import { getTrustedWeChatContext } from '../../server/trustedContext';
import {
  getUserSettings,
  type SettingsDependencies,
} from '../../server/settings/service';
import { getUserSettingsDependencies } from '../../server/runtime';

export function createMain(dependencies: SettingsDependencies) {
  return async (event: unknown, _context: unknown): Promise<unknown> => {
    try {
      return await getUserSettings(event, getTrustedWeChatContext(), dependencies);
    } catch {
      return { errorCode: 'INTERNAL_ERROR' };
    }
  };
}

export async function main(event: unknown, context: unknown): Promise<unknown> {
  return createMain(getUserSettingsDependencies())(event, context);
}
