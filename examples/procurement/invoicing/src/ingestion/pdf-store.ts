import { createHash } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { HttpError } from '@/errors';

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '' }
    : undefined,
});

function bucket(): string {
  const name = process.env.INVOICE_BUCKET;
  if (!name) throw new Error('INVOICE_BUCKET is not set');
  return name;
}

export function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface StoredPdf {
  key: string;
  sha256: string;
}

export async function storeInvoicePdf(
  bytes: Buffer,
  meta: { source: 'email' | 'upload'; originalName: string },
): Promise<StoredPdf> {
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-')
    throw new HttpError(415, 'only PDF invoices are accepted', 'unsupported_media');

  const digest = sha256(bytes);
  const now = new Date();
  // Content-addressed keys: re-sending the same PDF overwrites the identical object.
  const key = `invoices/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${digest}.pdf`;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: bytes,
      ContentType: 'application/pdf',
      ServerSideEncryption: 'aws:kms',
      Metadata: { source: meta.source, 'original-name': encodeURIComponent(meta.originalName) },
    }),
  );
  return { key, sha256: digest };
}

export async function loadInvoicePdf(key: string): Promise<Buffer> {
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!result.Body) throw new Error(`empty S3 object ${key}`);
  return Buffer.from(await result.Body.transformToByteArray());
}
