import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ForbiddenError } from '@/errors';

export type Role = 'requester' | 'approver' | 'buyer' | 'finance' | 'admin';

export interface Actor {
  id: string;
  email: string | null;
  roles: Role[];
  kind: 'user' | 'service';
}

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor;
  }
}

const KNOWN_CALLERS = new Set(['portal', 'invoicing', 'erp-sync', 'legacy-approvals']);

function tokenMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseUserHeader(raw: string): Actor {
  let decoded: Partial<Actor>;
  try {
    decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<Actor>;
  } catch {
    throw new ForbiddenError('malformed x-northwind-user header');
  }
  if (typeof decoded.id !== 'string' || !Array.isArray(decoded.roles)) {
    throw new ForbiddenError('malformed x-northwind-user header');
  }
  return { id: decoded.id, email: decoded.email ?? null, roles: decoded.roles, kind: 'user' };
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const expected = process.env.PROCURE_SERVICE_TOKEN;
  if (!expected) throw new Error('PROCURE_SERVICE_TOKEN is not set');

  const header = request.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const caller = String(request.headers['x-northwind-caller'] ?? '');
  if (!tokenMatches(token, expected) || !KNOWN_CALLERS.has(caller)) {
    await reply.code(401).send({ error: 'unauthorized' });
    return;
  }

  // Callers act on behalf of a user (portal, legacy-approvals) or as themselves (invoicing, erp-sync).
  const userHeader = request.headers['x-northwind-user'];
  request.actor =
    typeof userHeader === 'string'
      ? parseUserHeader(userHeader)
      : { id: `service:${caller}`, email: null, roles: [], kind: 'service' };
}

export function requireRole(...allowed: Role[]) {
  return async (request: FastifyRequest): Promise<void> => {
    const { roles } = request.actor;
    if (!roles.includes('admin') && !roles.some((role) => allowed.includes(role))) {
      throw new ForbiddenError(`requires one of: ${allowed.join(', ')}`);
    }
  };
}

export function requireService(...services: string[]) {
  return async (request: FastifyRequest): Promise<void> => {
    const { actor } = request;
    if (actor.kind !== 'service' || !services.some((s) => actor.id === `service:${s}`)) {
      throw new ForbiddenError('internal endpoint');
    }
  };
}
