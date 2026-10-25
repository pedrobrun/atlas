import type { Currency, OnboardVendorInput, VendorStatus } from '@northwind/contracts';
import type { Db, TxClient } from '@/db/pool';
import type { NormalizedBankAccount } from './banking';
import type { RiskAssessment } from './kyb';

export interface Vendor {
  id: string;
  legalName: string;
  country: string;
  contactEmail: string;
  categories: string[];
  status: VendorStatus;
  riskLevel: RiskAssessment['level'] | null;
  stripeAccountId: string | null;
  payoutCurrency: Currency | null;
  netsuiteId: string | null;
}

function toVendor(r: Record<string, any>): Vendor {
  return {
    id: r.id,
    legalName: r.legal_name,
    country: r.country,
    contactEmail: r.contact_email,
    categories: r.categories,
    status: r.status,
    riskLevel: r.risk_level,
    stripeAccountId: r.stripe_account_id,
    payoutCurrency: r.payout_currency,
    netsuiteId: r.netsuite_id,
  };
}

const COLUMNS =
  'id, legal_name, country, contact_email, categories, status, risk_level, stripe_account_id, payout_currency, netsuite_id';

export async function insertVendor(client: TxClient, input: OnboardVendorInput): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    'INSERT INTO vendors (legal_name, country, tax_id, contact_email, categories) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [input.legalName, input.country, input.taxId, input.contactEmail, input.categories],
  );
  return rows[0]!.id;
}

export async function findVendor(db: Db, id: string): Promise<Vendor | null> {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM vendors WHERE id = $1`, [id]);
  return rows[0] ? toVendor(rows[0]) : null;
}

export async function searchVendors(
  db: Db,
  q: string | undefined,
  status: VendorStatus | undefined,
): Promise<Vendor[]> {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM vendors
      WHERE ($1::text IS NULL OR legal_name ILIKE '%' || $1 || '%') AND ($2::text IS NULL OR status = $2)
      ORDER BY legal_name LIMIT 100`,
    [q ?? null, status ?? null],
  );
  return rows.map(toVendor);
}

export async function saveRisk(client: TxClient, id: string, risk: RiskAssessment) {
  await client.query(
    'UPDATE vendors SET risk_level = $2, risk_score = $3, updated_at = now() WHERE id = $1',
    [id, risk.level, risk.score],
  );
}

export async function insertBankAccount(
  client: TxClient,
  vendorId: string,
  account: NormalizedBankAccount,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO vendor_bank_accounts (vendor_id, kind, masked_number, bic, routing_number) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [vendorId, account.kind, account.maskedNumber, account.bic, account.routingNumber],
  );
  return rows[0]!.id;
}

export async function setPayoutAccount(
  client: TxClient,
  vendorId: string,
  stripeAccountId: string,
  currency: Currency,
) {
  await client.query(
    'UPDATE vendors SET stripe_account_id = $2, payout_currency = $3, updated_at = now() WHERE id = $1',
    [vendorId, stripeAccountId, currency],
  );
}
