import OpenAI from 'openai';
import { EXTRACTION_SHAPE, ExtractedInvoiceSchema, type ExtractedInvoice } from './extraction-schema';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_EXTRACTION_MODEL ?? 'gpt-4o-2024-08-06';

const SYSTEM_PROMPT = `You extract structured data from supplier invoices for the accounts payable team of Northwind Supply.
Return only a JSON object with exactly this shape:
${EXTRACTION_SHAPE}
Rules: copy amounts exactly as printed, as decimal strings without currency symbols. Use null for anything absent.
Never invent a purchase order number. Set confidence below 0.5 if the document may not be an invoice.`;

export class ExtractionError extends Error {}

export async function extractInvoiceFields(pdf: Buffer, filename: string): Promise<ExtractedInvoice> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'file',
            file: { filename, file_data: `data:application/pdf;base64,${pdf.toString('base64')}` },
          },
          { type: 'text', text: 'Extract this invoice.' },
        ],
      },
    ],
  });

  const raw = completion.choices[0]?.message.content;
  if (!raw) throw new ExtractionError('model returned no content');

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ExtractionError('model returned invalid JSON');
  }
  const parsed = ExtractedInvoiceSchema.safeParse(json);
  if (!parsed.success) {
    throw new ExtractionError(
      `extraction failed validation at ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  }
  return parsed.data;
}
