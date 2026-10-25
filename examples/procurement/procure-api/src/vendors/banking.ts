import type { BankAccountInput } from '@northwind/contracts';
import { InvariantViolation } from '@/errors';

export function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  // Mod-97 in chunks; the full number is far beyond Number precision.
  let remainder = 0;
  for (let i = 0; i < digits.length; i += 7) {
    remainder = Number(String(remainder) + digits.slice(i, i + 7)) % 97;
  }
  return remainder === 1;
}

export function isValidAbaRouting(routing: string): boolean {
  if (!/^\d{9}$/.test(routing)) return false;
  const d = routing.split('').map(Number);
  const checksum = 3 * (d[0]! + d[3]! + d[6]!) + 7 * (d[1]! + d[4]! + d[7]!) + (d[2]! + d[5]! + d[8]!);
  return checksum % 10 === 0;
}

export function maskAccountNumber(value: string): string {
  const clean = value.replace(/\s+/g, '');
  return `${'•'.repeat(Math.max(0, clean.length - 4))}${clean.slice(-4)}`;
}

export interface NormalizedBankAccount {
  kind: 'iban' | 'us_ach';
  maskedNumber: string;
  bic: string | null;
  routingNumber: string | null;
}

export function normalizeBankAccount(input: BankAccountInput): NormalizedBankAccount {
  if (input.kind === 'iban') {
    if (!isValidIban(input.iban)) throw new InvariantViolation('valid_iban', 'IBAN checksum failed');
    return { kind: 'iban', maskedNumber: maskAccountNumber(input.iban), bic: input.bic, routingNumber: null };
  }
  if (!isValidAbaRouting(input.routingNumber))
    throw new InvariantViolation('valid_routing', 'ABA routing checksum failed');
  return {
    kind: 'us_ach',
    maskedNumber: maskAccountNumber(input.accountNumber),
    bic: null,
    routingNumber: input.routingNumber,
  };
}
