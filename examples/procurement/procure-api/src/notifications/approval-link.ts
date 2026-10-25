import { createHmac } from 'node:crypto';

export type LinkDecision = 'approve' | 'reject';

/**
 * Builds the "approve by link" URL served by legacy-approvals (src/lib/link-token.js).
 * The token format must stay byte-compatible with that app until it is retired.
 */
export function approvalLink(
  stepId: string,
  approverId: string,
  decision: LinkDecision,
  ttlHours = 72,
): string {
  const secret = process.env.APPROVAL_LINK_SECRET;
  const baseUrl = process.env.LEGACY_APPROVALS_BASE_URL;
  if (!secret || !baseUrl) throw new Error('APPROVAL_LINK_SECRET and LEGACY_APPROVALS_BASE_URL must be set');

  const payload = Buffer.from(
    JSON.stringify({
      s: stepId,
      a: approverId,
      d: decision,
      exp: Math.floor(Date.now() / 1000) + ttlHours * 3600,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${baseUrl}/approve/${payload}.${signature}`;
}
