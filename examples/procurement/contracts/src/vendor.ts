import { z } from 'zod';
import { CurrencySchema } from './money';
import { CategoryCodeSchema } from './requisition';

export const VendorStatusSchema = z.enum(['pending_kyb', 'active', 'suspended', 'rejected']);
export type VendorStatus = z.infer<typeof VendorStatusSchema>;

export const OnboardVendorSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  country: z.string().length(2).toUpperCase(),
  taxId: z.string().trim().min(4).max(32),
  contactEmail: z.string().email(),
  categories: z.array(CategoryCodeSchema).max(20).default([]),
});
export type OnboardVendorInput = z.infer<typeof OnboardVendorSchema>;

export const KybResultSchema = z.object({
  taxIdVerified: z.boolean(),
  sanctionsMatch: z.boolean(),
  adverseMedia: z.boolean(),
  yearsInBusiness: z.number().int().nonnegative(),
  expectedAnnualSpendCents: z.number().int().nonnegative(),
});
export type KybResult = z.infer<typeof KybResultSchema>;

export const BankAccountInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('iban'),
    iban: z.string().min(15).max(34),
    bic: z.string().regex(/^[A-Z0-9]{8}([A-Z0-9]{3})?$/),
  }),
  z.object({
    kind: z.literal('us_ach'),
    routingNumber: z.string().regex(/^\d{9}$/),
    accountNumber: z.string().regex(/^\d{4,17}$/),
  }),
]);
export type BankAccountInput = z.infer<typeof BankAccountInputSchema>;

export const SetPayoutAccountSchema = z.object({
  stripeAccountId: z.string().regex(/^acct_[A-Za-z0-9]+$/),
  payoutCurrency: CurrencySchema,
});

export const PayoutAccountSchema = z.object({
  vendorId: z.string().uuid(),
  vendorStatus: VendorStatusSchema,
  stripeAccountId: z.string().regex(/^acct_[A-Za-z0-9]+$/),
  payoutCurrency: CurrencySchema,
});
export type PayoutAccount = z.infer<typeof PayoutAccountSchema>;
