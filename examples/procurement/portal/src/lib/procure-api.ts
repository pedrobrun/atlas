import { userHeader, type Session } from './session';

export class ApiError extends Error {
  constructor(
    readonly service: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`${service} responded ${status}`);
  }
}

export async function procureApi<T>(
  session: Session,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const baseUrl = process.env.PROCURE_API_URL;
  const token = process.env.PROCURE_SERVICE_TOKEN;
  if (!baseUrl || !token) throw new Error('PROCURE_API_URL and PROCURE_SERVICE_TOKEN must be set');

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
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new ApiError('procure-api', response.status, body);
  return body as T;
}
