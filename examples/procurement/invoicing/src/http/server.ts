import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { HttpError } from '@/errors';
import { exceptionRoutes } from '@/exceptions/exception.routes';
import { inboundEmailRoutes, uploadRoutes } from '@/ingestion/ingest.routes';
import { authenticate } from './auth';
import { internalRoutes } from './internal.routes';

export function buildServer() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 10 } });
  app.decorateRequest('actorId', '');

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({ error: 'validation_failed', issues: error.issues });
    if (error instanceof HttpError)
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    request.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send({ error: 'internal_error' });
  });

  app.get('/healthz', async () => ({ ok: true }));
  app.register(inboundEmailRoutes);
  app.register(async (api) => {
    api.addHook('preHandler', authenticate);
    await api.register(uploadRoutes);
    await api.register(exceptionRoutes);
    await api.register(internalRoutes);
  });
  return app;
}
