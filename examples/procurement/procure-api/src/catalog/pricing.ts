import { multiplyCents } from '@northwind/contracts';

export interface PriceTier {
  vendorId: string;
  minQuantity: number;
  unitPriceCents: number;
  validFrom: string;
  validTo: string | null;
  contractId: string | null;
}

export interface PriceQuote {
  vendorId: string;
  unitPriceCents: number;
  totalCents: number;
  preferred: boolean;
  contractId: string | null;
}

// Preferred vendors carry volume rebates that never show in unit prices, so they win
// unless another vendor is more than 5% cheaper.
const PREFERRED_TOLERANCE_BPS = 500;

export function quote(
  tiers: readonly PriceTier[],
  request: { quantity: number; on: string; preferredVendorIds: ReadonlySet<string> },
): PriceQuote | null {
  const eligible = tiers.filter(
    (t) =>
      t.minQuantity <= request.quantity &&
      t.validFrom <= request.on &&
      (t.validTo === null || request.on <= t.validTo),
  );

  const bestPerVendor = new Map<string, PriceTier>();
  for (const tier of eligible) {
    const current = bestPerVendor.get(tier.vendorId);
    if (!current || tier.unitPriceCents < current.unitPriceCents) bestPerVendor.set(tier.vendorId, tier);
  }
  if (bestPerVendor.size === 0) return null;

  const offers = [...bestPerVendor.values()]
    .map((t) => ({
      vendorId: t.vendorId,
      unitPriceCents: t.unitPriceCents,
      totalCents: multiplyCents(t.unitPriceCents, request.quantity),
      preferred: request.preferredVendorIds.has(t.vendorId),
      contractId: t.contractId,
    }))
    .sort((a, b) => a.unitPriceCents - b.unitPriceCents);

  const cheapest = offers[0]!;
  const preferred = offers.find((o) => o.preferred);
  if (
    preferred &&
    preferred.unitPriceCents * 10_000 <= cheapest.unitPriceCents * (10_000 + PREFERRED_TOLERANCE_BPS)
  ) {
    return preferred;
  }
  return cheapest;
}
