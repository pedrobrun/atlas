import type { Currency } from '@northwind/contracts';
import type { Db } from '@/db/pool';
import type { PriceTier } from './pricing';

export interface CatalogItem {
  id: string;
  sku: string;
  name: string;
  categoryCode: string;
  unit: string;
  listPriceCents: number;
  currency: Currency;
}

export async function searchItems(db: Db, q: string, limit = 25): Promise<CatalogItem[]> {
  const { rows } = await db.query(
    `SELECT id, sku, name, category_code, unit, list_price_cents, currency FROM catalog_items
      WHERE active AND (to_tsvector('english', name) @@ plainto_tsquery('english', $1) OR sku = $1)
      ORDER BY name LIMIT $2`,
    [q, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    categoryCode: r.category_code,
    unit: r.unit,
    listPriceCents: r.list_price_cents,
    currency: r.currency,
  }));
}

export async function tiersFor(db: Db, itemIds: string[]): Promise<Map<string, PriceTier[]>> {
  const { rows } = await db.query(
    `SELECT p.catalog_item_id, p.vendor_id, p.min_quantity, p.unit_price_cents, p.valid_from, p.valid_to, p.contract_id
       FROM catalog_prices p JOIN vendors v ON v.id = p.vendor_id AND v.status = 'active'
      WHERE p.catalog_item_id = ANY($1)`,
    [itemIds],
  );
  const byItem = new Map<string, PriceTier[]>();
  for (const r of rows) {
    const tier: PriceTier = {
      vendorId: r.vendor_id,
      minQuantity: r.min_quantity,
      unitPriceCents: r.unit_price_cents,
      validFrom: r.valid_from,
      validTo: r.valid_to,
      contractId: r.contract_id,
    };
    byItem.set(r.catalog_item_id, [...(byItem.get(r.catalog_item_id) ?? []), tier]);
  }
  return byItem;
}

export async function preferredVendorsByCategory(
  db: Db,
  categories: string[],
): Promise<Map<string, Set<string>>> {
  const { rows } = await db.query<{ category_code: string; vendor_id: string }>(
    'SELECT category_code, vendor_id FROM preferred_vendors WHERE category_code = ANY($1)',
    [categories],
  );
  const map = new Map<string, Set<string>>();
  for (const r of rows) map.set(r.category_code, (map.get(r.category_code) ?? new Set()).add(r.vendor_id));
  return map;
}
