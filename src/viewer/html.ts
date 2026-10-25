// Small HTML fragments the panels and the chat share.
import type { Confidence, Desc, Flow, Invariant } from '../types.ts';
import { hex, modLabel, REPO_COLOR, repoOf } from './data.ts';
import { esc } from './dom.ts';
import type { Key } from './i18n.ts';
import { L, t } from './i18n.ts';

const chip = (text: string, tone = '') => `<span class="chip${tone ? ' ' + tone : ''}">${text}</span>`;

const CONFIDENCE: Record<Confidence, { key: Key; tone: string }> = {
  verified: { key: 'verified', tone: 'ok' },
  inferred: { key: 'inferred', tone: 'warn' },
  generated: { key: 'generated', tone: '' },
};
export const confidenceChip = (c: Confidence | undefined) =>
  c ? chip(t(CONFIDENCE[c].key), CONFIDENCE[c].tone) : '';

const GUARD: Record<Invariant['guard'], { key: Key; tone: string }> = {
  test: { key: 'test', tone: 'ok' },
  type: { key: 'type', tone: 'ok' },
  partial: { key: 'partial', tone: 'warn' },
  none: { key: 'paper', tone: 'bad' },
};
export const guardChip = (g: Invariant['guard']) => chip(t(GUARD[g].key), GUARD[g].tone);

export const plainChip = (text: string, color?: number) =>
  `<span class="chip"${color === undefined ? '' : ` style="color:${hex(color)}"`}>${text}</span>`;

/** The repo's color as a small square. */
export const repoDot = (repo: string) =>
  `<span class="dot" style="background:${hex(REPO_COLOR[repo] ?? 0x888888)}"></span>`;

/** A titled section, or nothing when it has no body. */
export const section = (title: string, body: string) => (body ? `<h3>${title}</h3>${body}` : '');

/** The plain description first, the technical one under it. */
export function ledes(d: Desc | null | undefined) {
  if (!d) return `<p class="lede none">${t('noDesc')}</p>`;
  const plain = L(d, 'biz');
  const technical = L(d, 'tech');
  return (
    (plain ? `<p class="lede">${esc(plain)}</p>` : '') +
    (technical ? `<p class="lede second">${esc(technical)}</p>` : '')
  );
}

/** A link to a module, with its repo color and an optional count. */
export const moduleLink = (id: string, count?: number) =>
  `<button class="nb" data-go="${esc(id)}">${repoDot(repoOf(id))}${esc(modLabel(id))}${count === undefined ? '' : `<small>${count}</small>`}</button>`;

export const flowButton = (f: Flow, detailed = false) => {
  const title = `▶ ${esc(L(f, 'name'))}${detailed ? ' ' + confidenceChip(f.confidence) : ''}`;
  return `<button class="it" data-flow="${esc(f.id)}"><b>${title}</b>${detailed ? `<span>${esc(L(f, 'biz'))}</span>` : ''}</button>`;
};

export const ruleItem = (i: Invariant) =>
  `<div class="it"><b>${esc(L(i, 'name'))} ${guardChip(i.guard)}</b></div>`;
