import { getWXContext } from 'wx-server-sdk';
import { MissingTrustedOpenIdError } from '../shared/errors';

const trustedWeChatContextBrand: unique symbol = Symbol('TrustedWeChatContext');

type TrustedWeChatContext = {
  readonly openId: string;
  readonly [trustedWeChatContextBrand]: true;
};

export function getTrustedWeChatContext(): unknown {
  const openId = getWXContext().OPENID;
  if (typeof openId !== 'string' || openId.length === 0) {
    throw new MissingTrustedOpenIdError();
  }

  return Object.freeze({
    openId,
    [trustedWeChatContextBrand]: true as const,
  } satisfies TrustedWeChatContext);
}

export function readTrustedOpenId(context: unknown): string | null {
  if (
    typeof context !== 'object'
    || context === null
    || (context as TrustedWeChatContext)[trustedWeChatContextBrand] !== true
    || typeof (context as TrustedWeChatContext).openId !== 'string'
    || (context as TrustedWeChatContext).openId.length === 0
  ) {
    return null;
  }

  return (context as TrustedWeChatContext).openId;
}
