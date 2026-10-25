import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    actorId: string;
  }
}

const CALLERS = new Set(['portal', 'erp-sync']);

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const expected = process.env.INVOICING_SERVICE_TOKEN;
  if (!expected) throw new Error('INVOICING_SERVICE_TOKEN is not set');
  const presented = (request.headers.authorization ?? '').replace(/^Bearer /, '');
  const caller = String(request.headers['x-northwind-caller'] ?? '');
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b) || !CALLERS.has(caller)) {
    await reply.code(401).send({ error: 'unauthorized' });
    return;
  }

  const user = request.headers['x-northwind-user'];
  if (typeof user === 'string') {
    try {
      const { id } = JSON.parse(Buffer.from(user, 'base64url').toString('utf8')) as { id?: string };
      request.actorId = id ? `user:${id}` : `service:${caller}`;
      return;
    } catch {
      await reply.code(400).send({ error: 'malformed x-northwind-user header' });
      return;
    }
  }
  request.actorId = `service:${caller}`;
}
