import { parseDecimalToCents, type Currency } from '@northwind/contracts';
import { InvariantViolation } from '@/errors';

export interface PunchoutLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  currency: Currency;
  supplierSku: string;
  categoryCode: string;
}

const FIELD = /^NEW_ITEM-([A-Z_]+)\[(\d+)\]$/;

// UNSPSC segment (first two digits) to Northwind category; 4323 is software within IT.
function categoryForUnspsc(code: string | undefined): string {
  if (!code) return 'uncategorized';
  if (code.startsWith('4323')) return 'software';
  const segment: Record<string, string> = {
    '43': 'it-hardware',
    '44': 'office-supplies',
    '80': 'professional-services',
    '81': 'professional-services',
    '46': 'safety-equipment',
  };
  return segment[code.slice(0, 2)] ?? 'uncategorized';
}

/**
 * Suppliers return the punch-out cart as an SAP OCI form post:
 * NEW_ITEM-DESCRIPTION[1]=..., NEW_ITEM-QUANTITY[1]=2.000, NEW_ITEM-PRICE[1]=19.90, NEW_ITEM-PRICEUNIT[1]=1
 */
export function parseOciCart(form: Record<string, string>): PunchoutLine[] {
  const items = new Map<number, Record<string, string>>();
  for (const [key, value] of Object.entries(form)) {
    const match = FIELD.exec(key);
    if (!match) continue;
    const index = Number(match[2]);
    items.set(index, { ...(items.get(index) ?? {}), [match[1]!]: value.trim() });
  }

  return [...items.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, f]) => {
      const quantity = Number(f.QUANTITY);
      if (!Number.isInteger(quantity) || quantity <= 0)
        throw new InvariantViolation('punchout_quantity', `item ${index}: quantity must be a whole number`);
      const priceCents = parseDecimalToCents(f.PRICE ?? '');
      const priceUnit = Number(f.PRICEUNIT ?? '1');
      if (!Number.isInteger(priceUnit) || priceUnit <= 0 || priceCents % priceUnit !== 0) {
        throw new InvariantViolation(
          'punchout_price_unit',
          `item ${index}: price per ${f.PRICEUNIT} does not divide into whole cents`,
        );
      }
      return {
        description: f.DESCRIPTION ?? `Item ${index}`,
        quantity,
        unitPriceCents: priceCents / priceUnit,
        currency: (f.CURRENCY ?? 'USD') as Currency,
        supplierSku: f.VENDORMAT ?? '',
        categoryCode: categoryForUnspsc(f.MATGROUP),
      };
    });
}
