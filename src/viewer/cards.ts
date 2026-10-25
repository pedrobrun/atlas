import { isStale } from '../types.ts';
import type { Flow } from '../types.ts';
import { CAP, D, FLOW, isUnder, LEGACY_COLOR, modLabel, modules, repoName, SOURCES } from './data.ts';
import { esc } from './dom.ts';
import { fmt, L, t } from './i18n.ts';
import { state } from './state.ts';
import type { TreeNode } from './tree.ts';
import { countLoc, descOf, modulesUnder, view } from './tree.ts';
import {
  confidenceChip,
  flowButton,
  ledes,
  moduleLink,
  plainChip,
  repoDot,
  ruleItem,
  section,
} from './html.ts';

const kindName = (n: TreeNode) =>
  t(
    n.kind === 'cap'
      ? 'capability'
      : n.kind === 'file' || n.kind === 'module' || n.kind === 'area'
        ? n.kind
        : 'repo',
  );

function subject(): Exclude<TreeNode, { kind: 'group' }> {
  const n = view.T[state.sel ?? ''] || view.T[state.focus] || view.root;
  return n.kind === 'group' ? view.root : n;
}

export function detailsHtml(): string {
  const flow = FLOW[state.flow];
  if (flow) return flowCard(flow);
  const n = subject();
  if (n.kind === 'root') return rootCard();
  if (n.kind === 'cap') return capCard(n);
  if (n.kind === 'file') return fileCard(n);
  return nodeCard(n);
}

function rootCard() {
  const lens = state.lens === 'cap' ? t('rootCap') : t('rootRepo');
  const describesItself = L(D.system, 'biz') || L(D.system, 'tech');
  return [
    `<h2>${esc(D.config.name)}</h2>`,
    `<div class="kind">${modules.length} ${t('modules')} · ${SOURCES.length} repos · ${D.edges.length} ${t('deps')}</div>`,
    ledes(describesItself ? D.system : null),
    `<p class="lede second">${t('rootHow')} ${lens} ${t('rootHover')}</p>`,
    section(t('flows'), D.flows.map((f) => flowButton(f, true)).join('')),
    section(t('rules'), D.invariants.map(ruleItem).join('')),
  ].join('');
}

function capCard(n: Extract<TreeNode, { kind: 'cap' }>) {
  const members = modulesUnder(n);
  const flows = D.flows.filter((f) => f.steps.some((s) => members.includes(s.unit)));
  const places = n.children
    .map(
      (g) =>
        `<span class="nb">${g.kind === 'group' ? repoDot(g.repo) : ''}${esc(g.name)}<small>${g.children.length}</small></span>`,
    )
    .join('');
  return [
    `<h2>${esc(n.name)}</h2>`,
    `<div class="kind">${t('capability')} · ${members.length} ${t('modules')} · ${fmt(countLoc(n))} ${t('lines')}</div>`,
    ledes(n.cap),
    `<h3>${t('where')}</h3><div class="row">${places}</div>`,
    section(t('flowsHere'), flows.map((f) => flowButton(f)).join('')),
    `<p class="lede second" style="margin-top:14px">${t('hoverHint')}</p>`,
  ].join('');
}

function fileCard(n: Extract<TreeNode, { kind: 'file' }>) {
  const f = n.file;
  return [
    `<button class="x" data-close>×</button><h2>${esc(n.name)}</h2>`,
    `<div class="kind">${repoDot(n.repo)} ${t('file')} · ${f.loc} ${t('lines')} · <code>${f.hash}</code></div>`,
    `<p class="ev" style="margin-top:10px">${esc(f.path)}</p>`,
    ledes(f.desc),
  ].join('');
}

function neighbours(mine: Set<string>, side: 'out' | 'in') {
  const weights = new Map<string, number>();
  for (const e of D.edges) {
    const [here, there] = side === 'out' ? [e.from, e.to] : [e.to, e.from];
    if (mine.has(here) && !mine.has(there)) weights.set(there, (weights.get(there) ?? 0) + e.w);
  }
  return [...weights].sort((a, b) => b[1] - a[1]).slice(0, 8);
}

function nodeCard(n: Extract<TreeNode, { kind: 'repo' | 'area' | 'module' }>) {
  const m = n.ref;
  const d = m.desc;
  const mine = new Set(modulesUnder(n));
  const flows = D.flows.filter((f) => f.steps.some((s) => mine.has(s.unit)));
  const rules = D.invariants.filter((i) =>
    i.scope.some((s) => mine.has(s) || s === n.id || isUnder(n.id, s) || isUnder(s, n.id)),
  );
  const cap = m.cap && state.lens === 'repo' ? CAP[m.cap] : null;
  const legacy = m.legacy ? D.legacy[m.legacy] : null;
  const facts = [
    repoDot(n.repo) + ' ' + esc(repoName[n.repo]),
    kindName(n),
    `${fmt(countLoc(n))} ${t('lines')}`,
  ].join(' · ');
  const chips = [
    confidenceChip(d?.confidence),
    cap ? plainChip(esc(L(cap, 'name'))) : '',
    legacy ? plainChip(`● ${esc(L(legacy, 'label'))}`, LEGACY_COLOR[m.legacy ?? ''] ?? 0x888888) : '',
  ].join(' ');
  const hashes = d && `(<code>${d.describedHash}</code> → <code>${m.hash}</code>)`;
  const stale =
    d && isStale(m) ? `<div class="staleBox">${t('changed')} ${hashes}. ${t('changedTail')}</div>` : '';
  const evidence = (d?.anchors ?? [])
    .map((a) => `<div class="ev">${esc(a.path)}:${a.line}</div><div class="evn">${esc(L(a, 'note'))}</div>`)
    .join('');
  const links = (side: 'out' | 'in') => {
    const list = neighbours(mine, side);
    return list.length ? `<div class="row">${list.map(([id, w]) => moduleLink(id, w)).join('')}</div>` : '';
  };
  return [
    `<h2>${esc(n.kind === 'module' ? modLabel(n.id) : n.name)}</h2>`,
    `<div class="kind">${facts} ${chips}</div>`,
    ledes(d),
    stale,
    legacy ? `<p class="lede second">${esc(L(legacy, 'note'))}</p>` : '',
    section(t('evidence'), evidence),
    section(t('flows'), flows.map((f) => flowButton(f)).join('')),
    section(t('rulesShort'), rules.map(ruleItem).join('')),
    section(`<span style="color:#5b50e8">●</span> ${t('uses')}`, links('out')),
    section(`<span style="color:#14a08e">●</span> ${t('usedBy')}`, links('in')),
  ].join('');
}

function flowCard(f: Flow) {
  const steps = f.steps.map((step, i) => {
    const current = i === state.step;
    const anchor = step.anchor
      ? `<div class="ev">${esc(step.anchor)}</div>`
      : `<div class="evn">${t('noAnchor')}</div>`;
    const text = `<div class="t">${esc(L(step, 'text'))}</div>`;
    const module = `<div class="u">${esc(modLabel(step.unit))}</div>`;
    const number = `<span class="n">${i + 1}</span>`;
    return `<li data-step="${i}" class="${current ? 'on' : ''}">${number}<div>${text}${module}${current ? anchor : ''}</div></li>`;
  });
  return [
    `<button class="x" data-flow="">×</button><h2>${esc(L(f, 'name'))}</h2>`,
    `<div class="kind">${t('flowWord')} ${confidenceChip(f.confidence)} · ${f.steps.length} ${t('steps')}</div>`,
    `<p class="lede">${esc(L(f, 'biz'))}</p>`,
    `<ol class="steps">${steps.join('')}</ol>`,
    `<div class="flowNav">`,
    `<button data-stepby="-1">${t('prev')}</button><button data-stepby="1">${t('next')}</button>`,
    `</div>`,
  ].join('');
}

export function captionHtml(describing: Set<string>): string {
  const flow = FLOW[state.flow];
  if (flow) {
    const step = flow.steps[state.step];
    if (!step) return '';
    const anchor = step.anchor ? ` · <code>${esc(step.anchor)}</code>` : '';
    return [
      `<div class="k">${esc(L(flow, 'name'))} · ${state.step + 1}/${flow.steps.length}</div>`,
      `<div class="nav"><button data-stepby="-1">←</button><button data-stepby="1">→</button></div>`,
      `<div class="d" style="margin-top:4px">${esc(L(step, 'text'))}</div>`,
      `<div class="t">${esc(modLabel(step.unit))}${anchor}</div>`,
    ].join('');
  }
  const n = subject();
  if (n.kind === 'root') return '';
  const d = descOf(n);
  const lines = n.kind === 'file' ? n.file.loc : countLoc(n);
  const where = n.kind === 'cap' ? '' : `${repoDot(n.repo)} ${esc(repoName[n.repo])} · `;
  const confidence = confidenceChip(d && 'confidence' in d ? d.confidence : undefined);
  const header = `<div class="k">${where}${kindName(n)} · ${fmt(lines)} ${t('lines')} ${confidence}</div>`;
  const plain = d ? L(d, 'biz') || L(d, 'tech') : '';
  const owner = n.kind === 'file' ? n.parent! : n;
  let body: string;
  if (plain)
    body =
      `<div class="d">${esc(plain)}</div>` +
      (d && L(d, 'biz') && L(d, 'tech') ? `<div class="t">${esc(L(d, 'tech'))}</div>` : '');
  else if (describing.has(owner.id)) body = `<div class="t wait">${t('describing')}</div>`;
  else body = `<div class="t">${t('noDesc')}</div>`;
  return `${header}<b>${esc(n.kind === 'module' ? modLabel(n.id) : n.name)}</b>${body}`;
}
