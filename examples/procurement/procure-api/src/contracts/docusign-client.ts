import docusign from 'docusign-esign';

type ApiClient = InstanceType<typeof docusign.ApiClient>;

const SCOPES = ['signature', 'impersonation'];
const TOKEN_TTL_SECONDS = 3600;

let cached: { client: ApiClient; expiresAt: number } | null = null;

async function authorizedClient(): Promise<ApiClient> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.client;

  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
  const userId = process.env.DOCUSIGN_USER_ID;
  const privateKey = process.env.DOCUSIGN_PRIVATE_KEY_BASE64;
  if (!integrationKey || !userId || !privateKey)
    throw new Error('DocuSign JWT credentials are not configured');

  const client = new docusign.ApiClient();
  client.setBasePath(process.env.DOCUSIGN_BASE_PATH ?? 'https://demo.docusign.net/restapi');
  client.setOAuthBasePath(process.env.DOCUSIGN_OAUTH_HOST ?? 'account-d.docusign.com');
  const response = await client.requestJWTUserToken(
    integrationKey,
    userId,
    SCOPES,
    Buffer.from(privateKey, 'base64'),
    TOKEN_TTL_SECONDS,
  );
  client.addDefaultHeader('Authorization', `Bearer ${response.body.access_token}`);
  cached = { client, expiresAt: Date.now() + response.body.expires_in * 1000 };
  return client;
}

function accountId(): string {
  const id = process.env.DOCUSIGN_ACCOUNT_ID;
  if (!id) throw new Error('DOCUSIGN_ACCOUNT_ID is not set');
  return id;
}

export interface EnvelopeRequest {
  contractId: string;
  documentBase64: string;
  documentName: string;
  signerEmail: string;
  signerName: string;
  emailSubject: string;
}

export async function sendForSignature(req: EnvelopeRequest): Promise<string> {
  const envelopes = new docusign.EnvelopesApi(await authorizedClient());
  const definition = docusign.EnvelopeDefinition.constructFromObject({
    emailSubject: req.emailSubject,
    documents: [
      { documentBase64: req.documentBase64, name: req.documentName, fileExtension: 'pdf', documentId: '1' },
    ],
    recipients: {
      signers: [
        {
          email: req.signerEmail,
          name: req.signerName,
          recipientId: '1',
          routingOrder: '1',
          // Legal's contract templates carry an invisible /nw-sign/ anchor where the vendor signs.
          tabs: { signHereTabs: [{ anchorString: '/nw-sign/', anchorUnits: 'pixels', anchorYOffset: '10' }] },
        },
      ],
    },
    customFields: {
      textCustomFields: [{ name: 'northwind_contract_id', value: req.contractId, show: 'false' }],
    },
    status: 'sent',
  });
  const result = await envelopes.createEnvelope(accountId(), { envelopeDefinition: definition });
  if (!result.envelopeId) throw new Error('DocuSign did not return an envelope id');
  return result.envelopeId;
}

export async function voidEnvelope(envelopeId: string, reason: string): Promise<void> {
  const envelopes = new docusign.EnvelopesApi(await authorizedClient());
  await envelopes.update(accountId(), envelopeId, { envelope: { status: 'voided', voidedReason: reason } });
}
