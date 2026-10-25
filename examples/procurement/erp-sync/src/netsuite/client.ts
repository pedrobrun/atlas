import { tbaAuthorizationHeader, type TbaCredentials } from './oauth';

export class NetSuiteError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly retryable: boolean,
  ) {
    super(`NetSuite responded ${status}: ${body.slice(0, 300)}`);
  }
}

function credentials(): TbaCredentials {
  const creds = {
    accountId: process.env.NETSUITE_ACCOUNT_ID,
    consumerKey: process.env.NETSUITE_CONSUMER_KEY,
    consumerSecret: process.env.NETSUITE_CONSUMER_SECRET,
    tokenId: process.env.NETSUITE_TOKEN_ID,
    tokenSecret: process.env.NETSUITE_TOKEN_SECRET,
  };
  for (const [name, value] of Object.entries(creds))
    if (!value) throw new Error(`NetSuite credential ${name} is not set`);
  return creds as TbaCredentials;
}

function baseUrl(accountId: string): string {
  return (
    process.env.NETSUITE_REST_BASE_URL ||
    `https://${accountId.toLowerCase().replace(/_/g, '-')}.suitetalk.api.netsuite.com`
  );
}

export interface NetSuiteResponse<T> {
  status: number;
  body: T | null;
  location: string | null;
}

export async function netsuiteRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  path: string,
  opts: { body?: unknown; idempotencyKey?: string; headers?: Record<string, string> } = {},
): Promise<NetSuiteResponse<T>> {
  const creds = credentials();
  const url = `${baseUrl(creds.accountId)}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      authorization: tbaAuthorizationHeader(method, url, creds),
      accept: 'application/json',
      'content-type': 'application/json',
      ...(opts.idempotencyKey ? { 'X-NetSuite-Idempotency-Key': opts.idempotencyKey } : {}),
      ...opts.headers,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  if (!response.ok) {
    // 429 is NetSuite's concurrency governance; 5xx are transient. Everything else is our data.
    throw new NetSuiteError(response.status, text, response.status === 429 || response.status >= 500);
  }
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as T) : null,
    location: response.headers.get('location'),
  };
}

export function internalIdFromLocation(location: string | null): string {
  const match = location?.match(/\/(\d+)$/);
  if (!match?.[1]) throw new NetSuiteError(502, `no record id in Location header "${location}"`, false);
  return match[1];
}
