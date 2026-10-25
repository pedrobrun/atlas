'use strict';

const crypto = require('crypto');

// Format shared with procure-api/src/notifications/approval-link.ts:
//   base64url(JSON {s: stepId, a: approverId, d: "approve"|"reject", exp: unixSeconds}) + "." + base64url(HMAC-SHA256)
function verifyLinkToken(token, now) {
  const secret = process.env.APPROVAL_LINK_SECRET;
  if (!secret) throw new Error('APPROVAL_LINK_SECRET is not set');

  const parts = String(token || '').split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const payload = parts[0];
  const signature = parts[1];

  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (e) {
    return { ok: false, reason: 'malformed' };
  }
  const nowSeconds = Math.floor((now || Date.now()) / 1000);
  if (typeof claims.exp !== 'number' || claims.exp < nowSeconds) return { ok: false, reason: 'expired' };
  if (claims.d !== 'approve' && claims.d !== 'reject') return { ok: false, reason: 'malformed' };

  return { ok: true, stepId: claims.s, approverId: claims.a, decision: claims.d };
}

module.exports = { verifyLinkToken };
