import { isStale } from '../types.ts';
import type { Flow } from '../types.ts';
import { CAP, D, externals, FLOW, LEGACY_COLOR, N, modLabel, modules, repoName, SOURCES } from './data.ts';
import { esc } from './dom.ts';
import type { Key } from './i18n.ts';
import type { DescribeStatus } from './chat.ts';
import { fmt, L, t } from './i18n.ts';
import { state } from './state.ts';
import type { TreeNode } from './tree.ts';
import { countLoc, descOf, modulesUnder, view } from './tree.ts';
import { confidenceChip, flowButton, ledes, moduleLink, plainChip, repoDot, section } from './html.ts';

const KIND_NAME: Record<Exclude<TreeNode['kind'], 'root' | 'group'>, Key> = {
  cap: 'capability',
  repo: 'repo',
  area: 'area',
  module: 'module',
  file: 'file',
  external: 'external',
};
const kindName = (n: TreeNode) => (n.kind === 'root' || n.kind === 'group' ? '' : t(KIND_NAME[n.kind]));

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
  if (n.kind === 'external') return externalCard(n);
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
    section(t('externals'), `<div class="row">${externals.map((e) => moduleLink(e.id)).join('')}</div>`),
  ].join('');
}

function externalCard(n: Extract<TreeNode, { kind: 'external' }>) {
  const calls = D.edges.filter((e) => e.to === n.id).sort((a, b) => b.w - a.w);
  const flows = D.flows.filter((f) =>
    f.steps.some((s) => s.unit === n.id || calls.some((c) => c.from === s.unit)),
  );
  const callers = calls
    .map(
      (e) =>
        `<div class="dep"><div class="call">${moduleLink(e.from, e.w)}<div class="ev">${esc(e.at ?? '')}</div></div>${reason(e.from, n.id)}</div>`,
    )
    .join('');
  return [
    `<h2>${esc(n.name)}</h2>`,
    `<div class="kind">${t('external')}${n.ref.system ? ' · ' + esc(n.ref.system) : ''} · ${calls.length} ${t('modules')} ${confidenceChip(n.ref.desc?.confidence)}</div>`,
    n.ref.desc ? ledes(n.ref.desc) : `<p class="lede none">${t('noSystemDesc')}</p>`,
    section(
      `<span style="color:#d9822b">●</span> ${t('calledFrom')}`,
      callers || `<p class="lede second">${t('noCalls')}</p>`,
    ),
    section(t('flows'), flows.map((f) => flowButton(f)).join('')),
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
  return [...weights].sort((a, b) => b[1] - a[1]);
}

const reason = (from: string, to: string) => {
  const use = N[from]?.uses?.[to];
  return use ? `<p class="why">${esc(L(use, 'why'))}</p>` : '';
};

function nodeCard(n: Extract<TreeNode, { kind: 'repo' | 'area' | 'module' }>) {
  const m = n.ref;
  const d = m.desc;
  const mine = new Set(modulesUnder(n));
  const flows = D.flows.filter((f) => f.steps.some((s) => mine.has(s.unit)));
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
    if (n.kind !== 'module') {
      const top = list.slice(0, 8).map(([id, w]) => moduleLink(id, w));
      return top.length ? `<div class="row">${top.join('')}</div>` : '';
    }
    return list
      .map(
        ([id, w]) =>
          `<div class="dep">${moduleLink(id, w)}${side === 'out' ? reason(n.id, id) : reason(id, n.id)}</div>`,
      )
      .join('');
  };
  return [
    `<h2>${esc(n.kind === 'module' ? modLabel(n.id) : n.name)}</h2>`,
    `<div class="kind">${facts} ${chips}</div>`,
    ledes(d),
    stale,
    legacy ? `<p class="lede second">${esc(L(legacy, 'note'))}</p>` : '',
    section(t('evidence'), evidence),
    section(t('flows'), flows.map((f) => flowButton(f)).join('')),
    section(`<span style="color:#5b50e8">●</span> ${t('uses')}`, links('out')),
    section(`<span style="color:#14a08e">●</span> ${t('usedBy')}`, links('in')),
  ].join('');
}

function flowCard(f: Flow) {
  const steps = f.steps.map((step, i) => {
    const current = i === state.step;
    const anchor = `<div class="ev">${esc(step.anchor)}</div>`;
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

export function captionHtml(describeStatus: (id: string) => DescribeStatus | null): string {
  const flow = FLOW[state.flow];
  if (flow) {
    const step = flow.steps[state.step];
    if (!step) return '';
    const dots = flow.steps
      .map((s, i) => {
        const at = i === state.step ? ' now' : i < state.step ? ' done' : '';
        return `<button class="dot${at}" data-step="${i}" title="${esc(modLabel(s.unit))}"></button>`;
      })
      .join('');
    return [
      `<div class="flowbar">`,
      `<div class="top"><span class="name">${esc(L(flow, 'name'))}</span>`,
      `<span class="count">${t('step')} ${state.step + 1} ${t('of')} ${flow.steps.length}</span>`,
      `<span class="arrows"><button data-stepby="-1" aria-label="${t('prev')}">←</button><button data-stepby="1" aria-label="${t('next')}">→</button></span></div>`,
      `<div class="dots">${dots}</div>`,
      `<p class="say">${esc(L(step, 'text'))}</p>`,
      `<div class="where"><button class="nb" data-go="${esc(step.unit)}">${esc(modLabel(step.unit))}</button><code>${esc(step.anchor)}</code></div>`,
      `</div>`,
    ].join('');
  }
  const n = subject();
  if (n.kind === 'root') return '';
  const d = descOf(n);
  const lines = n.kind === 'file' ? n.file.loc : countLoc(n);
  const where =
    n.kind === 'cap' || n.kind === 'external' ? '' : `${repoDot(n.repo)} ${esc(repoName[n.repo])} · `;
  const confidence = confidenceChip(d && 'confidence' in d ? d.confidence : undefined);
  const size = n.kind === 'external' ? (n.ref.system ?? '') : `${fmt(lines)} ${t('lines')}`;
  const header = `<div class="k">${where}${kindName(n)} · ${size} ${confidence}</div>`;
  const plain = d ? L(d, 'biz') || L(d, 'tech') : '';
  const owner = n.kind === 'file' ? n.parent! : n;
  let body: string;
  if (plain)
    body =
      `<div class="d">${esc(plain)}</div>` +
      (d && L(d, 'biz') && L(d, 'tech') ? `<div class="t">${esc(L(d, 'tech'))}</div>` : '');
  else if (n.kind === 'external') body = `<div class="t">${t('noSystemDesc')}</div>`;
  else {
    const status = describeStatus(owner.id);
    if (status && 'seconds' in status)
      body = `<div class="t wait">${t('describing')} · ${status.seconds} s</div>`;
    else if (status) body = `<div class="t">${t('describeFailed')} ${esc(status.failed)}</div>`;
    else body = `<div class="t">${t('noDesc')}</div>`;
  }
  return `${header}<b>${esc(n.kind === 'module' ? modLabel(n.id) : n.name)}</b>${body}`;
}
