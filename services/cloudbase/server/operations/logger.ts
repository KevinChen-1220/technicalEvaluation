import { createHash } from 'node:crypto';

export type OperationalEvent = {
  eventName: string;
  ownerHash?: string;
  jobId?: string;
  reportId?: string;
  assessmentId?: string;
  safeCode?: string;
  durationMs?: number;
  count?: number;
  counts?: Record<string, number>;
};

export type OperationalLogger = {
  log(event: OperationalEvent): void;
};

export const noopOperationalLogger: OperationalLogger = {
  log() {},
};

export function ownerCorrelationHash(openId: string): string {
  return createHash('sha256').update(`owner\0${openId}`).digest('hex');
}
