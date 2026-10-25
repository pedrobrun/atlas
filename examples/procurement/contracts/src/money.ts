import { z } from 'zod';

export const CurrencySchema = z.enum(['USD', 'EUR', 'GBP']);
export type Currency = z.infer<typeof CurrencySchema>;

export const CentsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const MoneySchema = z.object({
  amountCents: CentsSchema,
  currency: CurrencySchema,
});
export type Money = z.infer<typeof MoneySchema>;

function assertSafe(value: number): number {
  if (!Number.isSafeInteger(value)) throw new RangeError('amount exceeds safe integer range');
  return value;
}

export function multiplyCents(unitPriceCents: number, quantity: number): number {
  if (!Number.isInteger(unitPriceCents) || !Number.isInteger(quantity)) {
    throw new RangeError('money math requires integer cents and integer quantities');
  }
  return assertSafe(unitPriceCents * quantity);
}

export function sumCents(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total = assertSafe(total + value);
  return total;
}

const DECIMAL = /^(-)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

export function parseDecimalToCents(input: string): number {
  const match = DECIMAL.exec(input.trim());
  if (!match) throw new RangeError(`not a decimal amount: "${input}"`);
  const [, sign, whole = '0', fraction = ''] = match;
  const cents = assertSafe(Number(whole.replace(/,/g, '')) * 100 + Number(fraction.padEnd(2, '0')));
  return sign ? -cents : cents;
}

export function centsToDecimalString(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function formatMoney(cents: number, currency: Currency, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}
