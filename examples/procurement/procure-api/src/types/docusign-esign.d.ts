// docusign-esign ships no type declarations; this covers the subset contracts/docusign-client.ts uses.
declare module 'docusign-esign' {
  interface JwtTokenResponse {
    body: { access_token: string; expires_in: number };
  }

  class ApiClient {
    setBasePath(basePath: string): void;
    setOAuthBasePath(host: string): void;
    addDefaultHeader(name: string, value: string): void;
    requestJWTUserToken(
      clientId: string,
      userId: string,
      scopes: string[],
      privateKey: Buffer,
      expiresInSeconds: number,
    ): Promise<JwtTokenResponse>;
  }

  class EnvelopesApi {
    constructor(client: ApiClient);
    createEnvelope(
      accountId: string,
      opts: { envelopeDefinition: unknown },
    ): Promise<{ envelopeId?: string }>;
    update(
      accountId: string,
      envelopeId: string,
      opts: { envelope: Record<string, unknown> },
    ): Promise<unknown>;
  }

  const EnvelopeDefinition: {
    constructFromObject(data: Record<string, unknown>): unknown;
  };

  const docusign: {
    ApiClient: typeof ApiClient;
    EnvelopesApi: typeof EnvelopesApi;
    EnvelopeDefinition: typeof EnvelopeDefinition;
  };
  export default docusign;
}
