import { randomBytes, timingSafeEqual } from 'node:crypto';

export const OPERATOR_TOKEN_HEADER = 'x-forgecanary-token';

export interface MutationRequestMetadata {
  contentType?: string;
  origin?: string;
  expectedOrigin: string;
  operatorToken?: string;
}

export interface MutationRejection {
  status: 403 | 415;
  error: string;
}

export function createOperatorToken(): string {
  return randomBytes(32).toString('base64url');
}

function tokensEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function validateOperatorMutation(
  metadata: MutationRequestMetadata,
  expectedToken: string
): MutationRejection | null {
  if (metadata.contentType?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    return { status: 415, error: 'State-changing requests require application/json' };
  }
  if (!metadata.operatorToken || !tokensEqual(metadata.operatorToken, expectedToken)) {
    return { status: 403, error: 'Missing or invalid operator token' };
  }
  if (metadata.origin && metadata.origin !== metadata.expectedOrigin) {
    return { status: 403, error: 'Cross-origin operator request rejected' };
  }
  return null;
}
