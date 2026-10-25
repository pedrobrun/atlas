import { createHmac, randomBytes } from 'node:crypto';

export interface TbaCredentials {
  accountId: string;
  consumerKey: string;
  consumerSecret: string;
  tokenId: string;
  tokenSecret: string;
}

const rfc3986 = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function tbaAuthorizationHeader(
  method: string,
  url: string,
  creds: TbaCredentials,
  nonce = randomBytes(16).toString('hex'),
  timestamp = Math.floor(Date.now() / 1000).toString(),
): string {
  const parsed = new URL(url);
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: timestamp,
    oauth_token: creds.tokenId,
    oauth_version: '1.0',
  };

  const params = [...Object.entries(oauth), ...parsed.searchParams.entries()]
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort(([ak, av], [bk, bv]) => (ak === bk ? av.localeCompare(bv) : ak < bk ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const baseUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  const baseString = [method.toUpperCase(), rfc3986(baseUrl), rfc3986(params)].join('&');
  const signingKey = `${rfc3986(creds.consumerSecret)}&${rfc3986(creds.tokenSecret)}`;
  const signature = createHmac('sha256', signingKey).update(baseString).digest('base64');

  // The realm is the account id upper-cased with underscores, e.g. sandbox "1234567_SB1".
  const header = {
    realm: creds.accountId.toUpperCase().replace(/-/g, '_'),
    ...oauth,
    oauth_signature: signature,
  };
  return (
    'OAuth ' +
    Object.entries(header)
      .map(([k, v]) => `${k}="${rfc3986(v)}"`)
      .join(', ')
  );
}
