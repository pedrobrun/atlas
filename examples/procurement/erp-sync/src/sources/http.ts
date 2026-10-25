export class SourceError extends Error {
  constructor(
    readonly service: string,
    readonly status: number,
    body: string,
  ) {
    super(`${service} responded ${status}: ${body.slice(0, 200)}`);
  }
}

export interface ServiceTarget {
  name: 'procure-api' | 'invoicing';
  baseUrl: string | undefined;
  token: string | undefined;
}

export async function callService(
  target: ServiceTarget,
  method: 'GET' | 'PUT',
  path: string,
  body?: unknown,
): Promise<unknown> {
  if (!target.baseUrl || !target.token) throw new Error(`${target.name} URL and token must be set`);
  const response = await fetch(`${target.baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${target.token}`,
      'x-northwind-caller': 'erp-sync',
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new SourceError(target.name, response.status, await response.text());
  return response.json();
}
