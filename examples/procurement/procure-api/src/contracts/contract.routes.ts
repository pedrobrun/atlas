import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '@/http/auth';
import { applyEnvelopeStatus, createVendorContract } from './contract.service';

const CreateContractBody = z.object({
  vendorId: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  documentBase64: z.string().min(100),
  signerEmail: z.string().email(),
  signerName: z.string().trim().min(2),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().nullable().default(null),
});

const ConnectEvent = z.object({
  event: z.string(),
  data: z.object({ envelopeId: z.string(), envelopeSummary: z.object({ status: z.string() }).optional() }),
});

export async function contractRoutes(app: FastifyInstance) {
  app.post('/vendor-contracts', { preHandler: requireRole('buyer', 'finance') }, async (request, reply) => {
    return reply
      .code(201)
      .send(await createVendorContract(request.actor, CreateContractBody.parse(request.body)));
  });
}

function validSignature(rawBody: string, header: string | undefined): boolean {
  const key = process.env.DOCUSIGN_CONNECT_HMAC_KEY;
  if (!key || !header) return false;
  const expected = createHmac('sha256', key).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Public webhook for DocuSign Connect. Registered outside the service-token scope. */
export async function docusignWebhookRoutes(app: FastifyInstance) {
  // The HMAC is computed over the exact bytes DocuSign sent, so keep the body as a string here.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => done(null, body));

  app.post('/webhooks/docusign', async (request, reply) => {
    const raw = request.body as string;
    if (!validSignature(raw, request.headers['x-docusign-signature-1'] as string | undefined)) {
      return reply.code(401).send({ error: 'invalid signature' });
    }
    const event = ConnectEvent.parse(JSON.parse(raw));
    const status = event.data.envelopeSummary?.status ?? event.event.replace(/^envelope-/, '');
    const result = await applyEnvelopeStatus(event.data.envelopeId, status);
    return reply.code(200).send({ result });
  });
}
