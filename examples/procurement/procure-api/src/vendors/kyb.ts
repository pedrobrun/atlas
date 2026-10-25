import type { KybResult } from '@northwind/contracts';

export type RiskLevel = 'low' | 'medium' | 'high' | 'blocked';

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  reasons: string[];
}

// Jurisdictions finance will not pay at all; maintained by the compliance team.
const EMBARGOED = new Set(['KP', 'IR', 'SY', 'CU']);
const LARGE_SPEND_CENTS = 25_000_000;

export function assessRisk(country: string, kyb: KybResult): RiskAssessment {
  const reasons: string[] = [];
  if (kyb.sanctionsMatch) return { score: 100, level: 'blocked', reasons: ['sanctions list match'] };
  if (EMBARGOED.has(country))
    return { score: 100, level: 'blocked', reasons: [`embargoed jurisdiction ${country}`] };

  let score = 0;
  if (!kyb.taxIdVerified) {
    score += 35;
    reasons.push('tax id not verified');
  }
  if (kyb.adverseMedia) {
    score += 30;
    reasons.push('adverse media');
  }
  if (kyb.yearsInBusiness < 2) {
    score += 15;
    reasons.push('less than two years in business');
  }
  if (kyb.expectedAnnualSpendCents >= LARGE_SPEND_CENTS) {
    score += 10;
    reasons.push('expected annual spend above $250k');
  }

  const level: RiskLevel = score >= 60 ? 'high' : score >= 25 ? 'medium' : 'low';
  return { score, level, reasons };
}

export function canActivate(assessment: RiskAssessment): boolean {
  return assessment.level === 'low' || assessment.level === 'medium';
}
