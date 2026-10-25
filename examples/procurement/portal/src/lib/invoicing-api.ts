import { ApiError } from './procure-api';
import { userHeader, type Session } from './session';

export async function invoicingApi<T>(
  session: Session,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const baseUrl = process.env.INVOICING_API_URL;
  const token = process.env.INVOICING_SERVICE_TOKEN;
  if (!baseUrl || !token) throw new Error('INVOICING_API_URL and INVOICING_SERVICE_TOKEN must be set');

  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'x-northwind-caller': 'portal',
      'x-northwind-user': userHeader(session),
      'content-type': 'application/json',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError('invoicing', response.status, body);
  return body as T;
}
