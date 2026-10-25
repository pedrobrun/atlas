import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export type PortalRole = 'requester' | 'approver' | 'buyer' | 'finance' | 'admin';

export interface Session {
  userId: string;
  email: string;
  name: string;
  roles: PortalRole[];
  expiresAt: number;
}

export const SESSION_COOKIE = 'nw_session';

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error('SESSION_SECRET is not set');
  return value;
}

/** Cookie format, minted by the SSO gateway: base64url(json).base64url(hmac-sha256). */
export function readSession(): Session | null {
  const raw = cookies().get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;

  const expected = createHmac('sha256', secret()).update(payload).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session;
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export function requirePageSession(...roles: PortalRole[]): Session {
  const session = readSession();
  if (!session) redirect(process.env.SSO_LOGIN_URL ?? '/login');
  if (roles.length > 0 && !hasAnyRole(session, roles)) redirect('/requests');
  return session;
}

export function hasAnyRole(session: Session, roles: PortalRole[]): boolean {
  return session.roles.includes('admin') || session.roles.some((r) => roles.includes(r));
}

/** The identity header procure-api and invoicing trust from the portal. */
export function userHeader(session: Session): string {
  return Buffer.from(
    JSON.stringify({ id: session.userId, email: session.email, roles: session.roles }),
  ).toString('base64url');
}
