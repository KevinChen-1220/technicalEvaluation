import { GenerationServiceError } from '../generation/errors';
import type { TextModerationPort } from '../moderation/ports';

type WeChatOpenApi = {
  security?: {
    msgSecCheck(input: {
      openid: string;
      scene: 2;
      version: 2;
      content: string;
      title?: string;
    }): Promise<unknown>;
  };
};

export function createWeChatMsgSecCheckModeration(options: {
  openapi: WeChatOpenApi;
  environment: Record<string, string | undefined>;
}): TextModerationPort {
  const checker = options.openapi.security?.msgSecCheck;
  const production = isFormalProduction(options.environment);
  if (checker === undefined && production) {
    throw new GenerationServiceError('CONFIGURATION_ERROR', false);
  }

  return {
    async checkText(input) {
      if (checker === undefined) return { allowed: true };
      try {
        const result = await checker({
          openid: input.ownerOpenId,
          scene: 2,
          version: 2,
          content: input.content,
          title: input.title,
        });
        return isPass(result) ? { allowed: true } : { allowed: false };
      } catch {
        return { allowed: false };
      }
    },
  };
}

function isFormalProduction(environment: Record<string, string | undefined>): boolean {
  return environment.SKILLSCOPE_ENV === 'production';
}

function isPass(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.errcode !== undefined && value.errcode !== 0) return false;
  const result = value.result;
  return isRecord(result) && result.suggest === 'pass';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
