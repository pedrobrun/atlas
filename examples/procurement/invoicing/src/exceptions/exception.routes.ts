import { ResolveExceptionSchema } from '@northwind/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '@/db/pool';
import { NotFoundError } from '@/errors';
import { listAwaitingMatch } from '@/invoices/invoice-queries';
import { findInvoice } from '@/invoices/invoice.repo';
import { resolveException } from './exception.service';

const IdParams = z.object({ id: z.string().uuid() });

export async function exceptionRoutes(app: FastifyInstance) {
  app.get('/invoices/awaiting-match', async () => ({ invoices: await listAwaitingMatch(pool) }));

  app.get('/invoices/:id', async (request) => {
    const { id } = IdParams.parse(request.params);
    const invoice = await findInvoice(pool, id);
    if (!invoice) throw new NotFoundError('invoice', id);
    const [history, matches] = await Promise.all([
      pool.query(
        'SELECT from_status, to_status, reason, changed_at FROM invoice_status_history WHERE invoice_id = $1 ORDER BY id',
        [id],
      ),
      pool.query(
        'SELECT outcome, variances, evaluated_at FROM match_results WHERE invoice_id = $1 ORDER BY id',
        [id],
      ),
    ]);
    return { invoice, history: history.rows, matchResults: matches.rows };
  });

  app.post('/exceptions/:id/resolve', async (request) => {
    const { id } = IdParams.parse(request.params);
    await resolveException(request.actorId, id, ResolveExceptionSchema.parse(request.body));
    return { ok: true };
  });
}
