import { createHmac } from 'node:crypto';

export function deriveOwnerKey(openId: string, ownerHmacKey: string): string {
  return createHmac('sha256', ownerHmacKey).update(openId, 'utf8').digest('hex');
}
