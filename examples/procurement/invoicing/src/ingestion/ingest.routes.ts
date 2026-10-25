import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { HttpError } from '@/errors';
import { ingestInvoice, type IngestResult } from './ingest.service';

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** SendGrid Inbound Parse posts every email sent to ap@northwind-supply.example here as multipart. */
export async function inboundEmailRoutes(app: FastifyInstance) {
  app.post('/ingest/email', async (request, reply) => {
    const expected = process.env.INBOUND_EMAIL_SECRET ?? '';
    const presented = (request.query as { key?: string }).key ?? '';
    if (!expected || !safeEqual(presented, expected)) return reply.code(401).send({ error: 'unauthorized' });

    let sender = 'unknown';
    const results: (IngestResult | { status: 'failed'; filename: string })[] = [];
    for await (const part of request.parts()) {
      if (part.type === 'field' && part.fieldname === 'from') sender = String(part.value);
      if (part.type !== 'file') continue;
      if (part.mimetype !== 'application/pdf') {
        part.file.resume();
        continue;
      }
      const bytes = await part.toBuffer();
      try {
        results.push(
          await ingestInvoice({
            bytes,
            filename: part.filename,
            source: 'email',
            submittedBy: `email:${sender}`,
          }),
        );
      } catch (err) {
        request.log.error({ err, filename: part.filename }, 'email invoice ingestion failed');
        results.push({ status: 'failed', filename: part.filename });
      }
    }
    // Always 200: SendGrid retries any non-2xx and would re-deliver every attachment in the email.
    return reply.code(200).send({ attachments: results.length, results });
  });
}

export async function uploadRoutes(app: FastifyInstance) {
  app.post('/invoices/upload', async (request, reply) => {
    const file = await request.file();
    if (!file) throw new HttpError(400, 'expected a multipart file field', 'missing_file');
    const result = await ingestInvoice({
      bytes: await file.toBuffer(),
      filename: file.filename,
      source: 'upload',
      submittedBy: request.actorId,
    });
    return reply.code(result.status === 'duplicate' ? 200 : 201).send(result);
  });
}
