import { parseDecimalToCents } from '@northwind/contracts';
import { pool, withTransaction } from '@/db/pool';
import { openException } from '@/exceptions/exception.repo';
import { findIdBySha, findIdByVendorInvoiceNumber } from '@/invoices/invoice-queries';
import * as invoices from '@/invoices/invoice.repo';
import { runMatch, type MatchOutcome } from '@/matching/match.service';
import { findMirrorByNumber } from '@/purchase-orders/po-mirror.repo';
import { ExtractionError, extractInvoiceFields } from './extractor';
import { storeInvoicePdf } from './pdf-store';

export interface IngestRequest {
  bytes: Buffer;
  filename: string;
  source: 'email' | 'upload';
  submittedBy: string;
}

export type IngestResult =
  | { status: 'duplicate'; invoiceId: string }
  | { status: 'ingested'; invoiceId: string; outcome: MatchOutcome }
  | { status: 'needs_review'; invoiceId: string; reason: string };

export async function ingestInvoice(req: IngestRequest): Promise<IngestResult> {
  const stored = await storeInvoicePdf(req.bytes, { source: req.source, originalName: req.filename });
  const existing = await findIdBySha(pool, stored.sha256);
  if (existing) return { status: 'duplicate', invoiceId: existing };

  const base = { source: req.source, s3Key: stored.key, sha256: stored.sha256, submittedBy: req.submittedBy };
  let extracted;
  try {
    extracted = await extractInvoiceFields(req.bytes, req.filename);
  } catch (err) {
    if (!(err instanceof ExtractionError)) throw err;
    const invoiceId = await withTransaction(async (client) => {
      const id = await invoices.insertInvoice(client, { ...base, status: 'received' });
      await openException(client, id, 'extraction_failed', { message: err.message });
      await invoices.transitionInvoice(client, id, ['received'], 'exception', 'extraction failed');
      return id;
    });
    return { status: 'needs_review', invoiceId, reason: err.message };
  }

  const po = extracted.purchaseOrderNumber
    ? await findMirrorByNumber(pool, extracted.purchaseOrderNumber)
    : null;
  if (po) {
    const duplicate = await findIdByVendorInvoiceNumber(pool, po.vendorId, extracted.invoiceNumber);
    if (duplicate) return { status: 'duplicate', invoiceId: duplicate };
  }

  const subtotalCents = parseDecimalToCents(extracted.subtotal);
  const taxCents = parseDecimalToCents(extracted.tax);
  const totalCents = parseDecimalToCents(extracted.total);
  const minConfidence = Number(process.env.EXTRACTION_MIN_CONFIDENCE ?? 0.85);
  const problem =
    subtotalCents + taxCents !== totalCents
      ? ({ reason: 'totals_inconsistent', details: { subtotalCents, taxCents, totalCents } } as const)
      : extracted.confidence < minConfidence
        ? ({ reason: 'low_confidence', details: { confidence: extracted.confidence } } as const)
        : null;

  const invoiceId = await withTransaction(async (client) => {
    const id = await invoices.insertInvoice(client, {
      ...base,
      status: 'extracted',
      vendorId: po?.vendorId ?? null,
      vendorName: po?.vendorName ?? extracted.vendorName,
      purchaseOrderId: po?.id ?? null,
      purchaseOrderNumber: extracted.purchaseOrderNumber,
      invoiceNumber: extracted.invoiceNumber,
      currency: extracted.currency,
      subtotalCents,
      taxCents,
      totalCents,
      lines: extracted.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPriceCents: parseDecimalToCents(l.unitPrice),
        poLineNo: l.poLineNo,
      })),
      issueDate: extracted.issueDate,
      dueDate: extracted.dueDate,
      extractionConfidence: extracted.confidence,
    });
    if (problem) {
      await openException(client, id, problem.reason, problem.details);
      await invoices.transitionInvoice(client, id, ['extracted'], 'exception', problem.reason);
    }
    return id;
  });

  if (problem) return { status: 'needs_review', invoiceId, reason: problem.reason };
  return { status: 'ingested', invoiceId, outcome: await runMatch(invoiceId) };
}
