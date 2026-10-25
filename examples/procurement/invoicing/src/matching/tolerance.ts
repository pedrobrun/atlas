export interface ToleranceRules {
  /** Allowed unit-price overage as basis points of the PO price. */
  priceVarianceBps: number;
  /** Cap on the total overage per line, whatever the percentage says. */
  priceVarianceMaxCents: number;
  /** Units that may be billed beyond what was received. Zero: we pay for what arrived. */
  quantityOverReceipt: number;
  /** Rounding slack between the sum of lines and the printed subtotal. */
  subtotalRoundingCents: number;
}

export const DEFAULT_TOLERANCE: ToleranceRules = {
  priceVarianceBps: 200,
  priceVarianceMaxCents: 5_000,
  quantityOverReceipt: 0,
  subtotalRoundingCents: 5,
};

export function loadToleranceRules(): ToleranceRules {
  return {
    ...DEFAULT_TOLERANCE,
    priceVarianceBps: Number(process.env.MATCH_PRICE_TOLERANCE_BPS ?? DEFAULT_TOLERANCE.priceVarianceBps),
    priceVarianceMaxCents: Number(
      process.env.MATCH_PRICE_TOLERANCE_MAX_CENTS ?? DEFAULT_TOLERANCE.priceVarianceMaxCents,
    ),
  };
}

export function priceWithinTolerance(
  poUnitCents: number,
  invoiceUnitCents: number,
  quantity: number,
  rules: ToleranceRules,
): boolean {
  if (invoiceUnitCents <= poUnitCents) return true;
  const overagePerUnit = invoiceUnitCents - poUnitCents;
  const withinPercent = overagePerUnit * 10_000 <= poUnitCents * rules.priceVarianceBps;
  const withinCap = overagePerUnit * quantity <= rules.priceVarianceMaxCents;
  return withinPercent && withinCap;
}
