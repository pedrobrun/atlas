import {
  InvoicedAmountSchema,
  PayoutAccountSchema,
  type InvoicedAmount,
  type PayoutAccount,
} from '@northwind/contracts';

export class ProcureApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`procure-api responded ${status}: ${body.slice(0, 200)}`);
  }

  /** 4xx answers are decisions (invariant violated, vendor inactive); retrying will not change them. */
  get isRejection(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 429;
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const baseUrl = process.env.PROCURE_API_URL;
  const token = process.env.PROCURE_SERVICE_TOKEN;
  if (!baseUrl || !token) throw new Error('PROCURE_API_URL and PROCURE_SERVICE_TOKEN must be set');

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'x-northwind-caller': 'invoicing',
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new ProcureApiError(response.status, await response.text());
  return (await response.json()) as T;
}

export async function getPayoutAccount(vendorId: string): Promise<PayoutAccount> {
  return PayoutAccountSchema.parse(await call('GET', `/internal/vendors/${vendorId}/payout-account`));
}

export async function reportInvoiced(
  purchaseOrderId: string,
  amount: InvoicedAmount,
): Promise<'consumed' | 'duplicate'> {
  const result = await call<{ status: 'consumed' | 'duplicate' }>(
    'POST',
    `/internal/purchase-orders/${purchaseOrderId}/invoiced`,
    InvoicedAmountSchema.parse(amount),
  );
  return result.status;
}
