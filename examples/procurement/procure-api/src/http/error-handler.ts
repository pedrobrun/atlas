import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { DomainError } from '@/errors';

const PG_UNIQUE_VIOLATION = '23505';
const PG_CHECK_VIOLATION = '23514';

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: 'validation_failed',
      issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  if (error instanceof DomainError) {
    return reply
      .code(error.statusCode)
      .send({ error: error.code, message: error.message, details: error.details });
  }
  const pgCode = (error as { code?: string }).code;
  if (pgCode === PG_UNIQUE_VIOLATION) {
    return reply.code(409).send({ error: 'conflict', message: 'duplicate record' });
  }
  if (pgCode === PG_CHECK_VIOLATION) {
    // The database constraint caught something the domain guards missed; log loudly.
    request.log.error({ err: error }, 'database check constraint violated');
    return reply.code(422).send({ error: 'invariant.database_check', message: 'constraint violated' });
  }
  request.log.error({ err: error }, 'unhandled error');
  return reply.code(500).send({ error: 'internal_error' });
}
