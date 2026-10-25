import { CurrencySchema } from '@northwind/contracts';
import { z } from 'zod';

const DecimalAmount = z
  .string()
  .regex(/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/, 'decimal amount without currency symbol');

export const ExtractedInvoiceSchema = z.object({
  vendorName: z.string().min(1),
  vendorTaxId: z.string().nullable(),
  invoiceNumber: z.string().min(1).max(64),
  // A malformed PO number is treated as missing; the invoice then goes to the exception queue.
  purchaseOrderNumber: z
    .string()
    .regex(/^PO-\d{4}-\d{6}$/)
    .nullable()
    .catch(null),
  currency: CurrencySchema,
  issueDate: z.string().date(),
  dueDate: z.string().date().nullable(),
  lines: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: z.number().int().positive(),
        unitPrice: DecimalAmount,
        poLineNo: z.number().int().positive().nullable(),
      }),
    )
    .min(1)
    .max(500),
  subtotal: DecimalAmount,
  tax: DecimalAmount,
  total: DecimalAmount,
  confidence: z.number().min(0).max(1),
});

export type ExtractedInvoice = z.infer<typeof ExtractedInvoiceSchema>;

export const EXTRACTION_SHAPE = `{
  "vendorName": string, "vendorTaxId": string | null, "invoiceNumber": string,
  "purchaseOrderNumber": "PO-YYYY-NNNNNN" | null, "currency": "USD" | "EUR" | "GBP",
  "issueDate": "YYYY-MM-DD", "dueDate": "YYYY-MM-DD" | null,
  "lines": [{ "description": string, "quantity": integer, "unitPrice": "123.45", "poLineNo": integer | null }],
  "subtotal": "123.45", "tax": "0.00", "total": "123.45",
  "confidence": number between 0 and 1
}`;
