// The top bar, the Details panel, the in-scene caption and the left rail.
import type { Confidence, Desc, Flow, Invariant } from '../types.ts';
import {
  CAP,
  D,
  esc,
  FLOW,
  hex,
  isUnder,
  LEGACY_COLOR,
  modLabel,
  modules,
  REPO_COLOR,
  repoName,
  repoOf,
  SOURCES,
} from './data.ts';
import { fmt, L, t } from './i18n.ts';
import { save, state } from './state.ts';
import type { TreeNode } from './tree.ts';
import { ancestors, countLoc, modulesUnder, view } from './tree.ts';
import { applyState, goTo, goUp, showFlow, stepBy } from './nav.ts';
import { buildScene, fitView, frameFocus } from './scene.ts';
import { describing, ensureDescribed, focusChat, renderChat } from './chat.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const card = $('card');

const guard = (g: Invariant['guard']) =>
  g === 'test'
    ? `<span class="chip ok">${t('test')}</span>`
    : g === 'type'
      ? `<span class="chip ok">${t('type')}</span>`
      : g === 'partial'
        ? `<span class="chip warn">${t('partial')}</span>`
        : `<span class="chip bad">${t('paper')}</span>`;
export const conf = (c?: Confidence) =>
  c === 'verified'
    ? `<span class="chip ok">${t('verified')}</span>`
    : c === 'inferred'
      ? `<span class="chip warn">${t('inferred')}</span>`
      : c === 'generated'
        ? `<span class="chip">${t('generated')}</span>`
        : '';
export const sw = (r: string) =>
  `<span class="dot" style="background:${hex(REPO_COLOR[r] ?? 0x888888)}"></span>`;

/** The description that applies to a tree node, if any. */
export const descOf = (n: TreeNode): Desc | undefined =>
  n.kind === 'cap' ? n.cap : n.kind === 'file' ? n.file!.desc : n.ref?.desc;
/** One line for tooltips: the plain description, or the technical one. */
export const summary = (n: TreeNode) => {
  const d = descOf(n);
  return d ? L(d, 'biz') || L(d, 'tech') : '';
};

function ledes(d: Desc | null | undefined) {
  if (!d) return `<p class="lede none">${t('noDesc')}</p>`;
  const a = L(d, 'biz'),
    b = L(d, 'tech');
  return `${a ? `<p class="lede">${esc(a)}</p>` : ''}${b ? `<p class="lede second">${esc(b)}</p>` : ''}`;
}
const nbList = (m: Map<string, number>) =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(
      ([id, w]) =>
        `<button class="nb" data-go="${id}">${sw(repoOf(id))}${esc(modLabel(id))}<small>${w}</small></button>`,
    )
    .join('');
const flowButton = (x: Flow, withBiz = false) =>
  `<button class="it" data-flow="${x.id}"><b>▶ ${esc(L(x, 'name'))}${withBiz ? ' ' + conf(x.confidence) : ''}</b>${withBiz ? `<span>${esc(L(x, 'biz'))}</span>` : ''}</button>`;

export function renderUI() {
  document.documentElement.lang = state.lang === 'en' ? 'en' : 'pt-BR';
  for (const el of document.querySelectorAll<HTMLElement>('[data-t]')) el.textContent = t(el.dataset.t!);
  for (const el of document.querySelectorAll<HTMLElement>('[data-t-html]'))
    el.innerHTML = t(el.dataset.tHtml!);
  for (const seg of document.querySelectorAll<HTMLElement>('.seg'))
    for (const b of seg.querySelectorAll<HTMLElement>('button'))
      b.classList.toggle('on', b.dataset.v === state[seg.id as 'lens' | 'lang']);
  const flowSel = $<HTMLSelectElement>('flowSel');
  flowSel.innerHTML =
    '<option value="">—</option>' +
    D.flows.map((f) => `<option value="${f.id}">${esc(L(f, 'name'))}</option>`).join('');
  flowSel.value = state.flow;
  const f = view.T[state.focus] || view.root;
  const path = [f, ...ancestors(f)].filter((n) => n.kind !== 'group').reverse();
  $('crumbs').innerHTML = path
    .map(
      (n, i) =>
        `${i ? '<span class="sep">›</span>' : ''}<button data-focus="${n.id}" class="${i === path.length - 1 ? 'cur' : ''}">${esc(n.name)}</button>`,
    )
    .join('');
  $('up').hidden = f === view.root && !state.flow && !state.sel;
  const stale = modules.filter((m) => m.stale);
  const sp = $('stalePill');
  sp.hidden = !stale.length;
  sp.textContent = `${stale.length} ${t('stale')}`;
  renderCard();
  renderRail();
  renderChat();
  ensureDescribed(view.T[state.sel ?? '']?.kind === 'file' ? view.T[state.sel!].parent : view.T[state.focus]);
}

/** What you are looking at, said in the scene itself (the Details panel has the rest). */
export function renderCaption() {
  const el = $('caption');
  let html = '';
  const fl = FLOW[state.flow];
  if (fl) {
    const x = fl.steps[state.step];
    if (x)
      html = `<div class="k">${esc(L(fl, 'name'))} · ${state.step + 1}/${fl.steps.length}</div><div class="nav"><button data-stepby="-1">←</button><button data-stepby="1">→</button></div>
      <div class="d" style="margin-top:4px">${esc(L(x, 'text'))}</div><div class="t">${esc(modLabel(x.unit))}${x.anchor ? ` · <code>${esc(x.anchor)}</code>` : ''}</div>`;
  } else {
    const n = view.T[state.sel ?? ''] || view.T[state.focus];
    if (n && n !== view.root && n.kind !== 'group') {
      const d = descOf(n);
      const owner = n.kind === 'file' ? n.parent! : n;
      const loc = n.kind === 'file' ? n.file!.loc : countLoc(n);
      const kind = t(n.kind === 'cap' ? 'capability' : n.kind);
      const title = n.kind === 'module' ? modLabel(n.id) : n.name;
      const a = d && (L(d, 'biz') || L(d, 'tech')),
        b = d && L(d, 'biz') && L(d, 'tech');
      html =
        `<div class="k">${n.repo ? sw(n.repo) + ' ' + esc(repoName[n.repo]) + ' · ' : ''}${kind} · ${fmt(loc)} ${t('lines')} ${conf(d?.confidence)}</div><b>${esc(title)}</b>` +
        (a
          ? `<div class="d">${esc(a)}</div>${b ? `<div class="t">${esc(L(d, 'tech'))}</div>` : ''}`
          : describing.has(owner.id)
            ? `<div class="t wait">${t('describing')}</div>`
            : `<div class="t">${t('noDesc')}</div>`);
    }
  }
  el.innerHTML = html;
  el.hidden = !html || state.panel === 'details';
}

function renderCard() {
  const fl = FLOW[state.flow];
  if (fl) return cardFlow(fl);
  const n = view.T[state.sel ?? ''] || view.T[state.focus] || view.root;
  if (n === view.root) return cardRoot();
  if (n.kind === 'cap') return cardCap(n);
  if (n.kind === 'file') return cardFile(n);
  cardNode(n);
}
function cardRoot() {
  card.innerHTML = `<h2>${esc(D.config.name)}</h2><div class="kind">${modules.length} ${t('modules')} · ${SOURCES.length} repos · ${D.edges.length} ${t('deps')}</div>
    ${ledes(L(D.system, 'biz') || L(D.system, 'tech') ? D.system : null)}
    <p class="lede second">${t('rootHow')} ${state.lens === 'cap' ? t('rootCap') : t('rootRepo')} ${t('rootHover')}</p>
    ${D.flows.length ? `<h3>${t('flows')}</h3>${D.flows.map((x) => flowButton(x, true)).join('')}` : ''}
    ${D.invariants.length ? `<h3>${t('rules')}</h3>${D.invariants.map((i) => `<div class="it"><b>${esc(L(i, 'name'))} ${guard(i.guard)}</b></div>`).join('')}` : ''}`;
}
function cardCap(n: TreeNode) {
  const ms = modulesUnder(n);
  const flows = D.flows.filter((f) => f.steps.some((s) => ms.includes(s.unit)));
  card.innerHTML = `<h2>${esc(n.name)}</h2><div class="kind">${t('capability')} · ${ms.length} ${t('modules')} · ${fmt(countLoc(n))} ${t('lines')}</div>${ledes(n.cap)}
    <h3>${t('where')}</h3><div class="row">${n.children.map((g) => `<span class="nb">${sw(g.repo!)}${esc(g.name)}<small>${g.children.length}</small></span>`).join('')}</div>
    ${flows.length ? `<h3>${t('flowsHere')}</h3>${flows.map((x) => flowButton(x)).join('')}` : ''}
    <p class="lede second" style="margin-top:14px">${t('hoverHint')}</p>`;
}
function cardFile(n: TreeNode) {
  const f = n.file!;
  card.innerHTML = `<button class="x" data-close>×</button><h2>${esc(n.name)}</h2><div class="kind">${sw(n.repo!)} ${t('file')} · ${f.loc} ${t('lines')} · <code>${f.hash}</code></div><p class="ev" style="margin-top:10px">${esc(f.path)}</p>${ledes(f.desc)}`;
}
function cardNode(n: TreeNode) {
  const m = n.ref,
    id = n.id;
  const mine = new Set(modulesUnder(n));
  const outs = new Map<string, number>(),
    ins = new Map<string, number>();
  for (const e of D.edges) {
    if (mine.has(e.from) && !mine.has(e.to)) outs.set(e.to, (outs.get(e.to) || 0) + e.w);
    if (mine.has(e.to) && !mine.has(e.from)) ins.set(e.from, (ins.get(e.from) || 0) + e.w);
  }
  const d = m?.desc;
  const flows = D.flows.filter((f) => f.steps.some((s) => mine.has(s.unit)));
  const invs = D.invariants.filter((i) =>
    i.scope.some((s) => mine.has(s) || s === id || isUnder(id, s) || isUnder(s, id)),
  );
  const cap = m?.cap && state.lens === 'repo' ? CAP[m.cap] : null;
  const lg = m?.legacy ? D.legacy[m.legacy] : null;
  card.innerHTML = `<h2>${esc(n.kind === 'module' ? modLabel(id) : n.name)}</h2>
    <div class="kind">${sw(n.repo!)} ${esc(repoName[n.repo!])} · ${t(n.kind)} · ${fmt(countLoc(n))} ${t('lines')} ${conf(d?.confidence)} ${cap ? `<span class="chip">${esc(L(cap, 'name'))}</span>` : ''}
    ${lg ? `<span class="chip" style="color:${hex(LEGACY_COLOR[m!.legacy!] ?? 0x888888)}">● ${esc(L(lg, 'label'))}</span>` : ''}</div>
    ${ledes(d)}
    ${m?.stale && d ? `<div class="staleBox">${t('changed')} (<code>${d.describedHash}</code> → <code>${m.hash}</code>). ${t('changedTail')}</div>` : ''}
    ${lg ? `<p class="lede second">${esc(L(lg, 'note'))}</p>` : ''}
    ${d?.anchors?.length ? `<h3>${t('evidence')}</h3>${d.anchors.map((a) => `<div class="ev">${esc(a.path)}:${a.line}</div><div class="evn">${esc(L(a, 'note'))}</div>`).join('')}` : ''}
    ${flows.length ? `<h3>${t('flows')}</h3>${flows.map((x) => flowButton(x)).join('')}` : ''}
    ${invs.length ? `<h3>${t('rulesShort')}</h3>${invs.map((i) => `<div class="it"><b>${esc(L(i, 'name'))} ${guard(i.guard)}</b></div>`).join('')}` : ''}
    ${outs.size ? `<h3><span style="color:#5b50e8">●</span> ${t('uses')}</h3><div class="row">${nbList(outs)}</div>` : ''}
    ${ins.size ? `<h3><span style="color:#14a08e">●</span> ${t('usedBy')}</h3><div class="row">${nbList(ins)}</div>` : ''}`;
}
function cardFlow(f: Flow) {
  card.innerHTML = `<button class="x" data-flow="">×</button><h2>${esc(L(f, 'name'))}</h2><div class="kind">${t('flowWord')} ${conf(f.confidence)} · ${f.steps.length} ${t('steps')}</div><p class="lede">${esc(L(f, 'biz'))}</p>
    <ol class="steps">${f.steps.map((x, i) => `<li data-step="${i}" class="${i === state.step ? 'on' : ''}"><span class="n">${i + 1}</span><div><div class="t">${esc(L(x, 'text'))}</div><div class="u">${esc(modLabel(x.unit))}</div>${i === state.step ? (x.anchor ? `<div class="ev">${esc(x.anchor)}</div>` : `<div class="evn">${t('noAnchor')}</div>`) : ''}</div></li>`).join('')}</ol>
    <div class="flowNav"><button data-stepby="-1">${t('prev')}</button><button data-stepby="1">${t('next')}</button></div>`;
}

// ---------- rail: one panel at a time; clicking the active button closes it ----------
export function renderRail() {
  card.classList.toggle('collapsed', state.panel !== 'details');
  $('chat').classList.toggle('collapsed', state.panel !== 'ask');
  document.body.classList.toggle('paneled', !!state.panel);
  for (const b of document.querySelectorAll<HTMLElement>('#rail [data-panel]'))
    b.classList.toggle('on', b.dataset.panel === state.panel);
  renderCaption();
}
function setPanel(p: 'ask' | 'details') {
  state.panel = state.panel === p ? null : p;
  renderRail();
  fitView();
  save();
  if (state.panel === 'ask') focusChat();
}

// ---------- clicks on the bar, the card and the caption ----------
export function wirePanels() {
  $('rail').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-panel]');
    if (b) setPanel(b.dataset.panel as 'ask' | 'details');
  });
  document.body.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>(
      '[data-v],[data-focus],[data-flow],[data-go],[data-step],[data-stepby],[data-close],#up,#stalePill',
    );
    if (!el) return;
    const seg = el.closest<HTMLElement>('.seg');
    if (seg && el.dataset.v) {
      if (seg.id === 'lang' && state.lang !== el.dataset.v) {
        state.lang = el.dataset.v as 'en' | 'pt';
        buildScene();
      }
      if (seg.id === 'lens' && state.lens !== el.dataset.v) {
        state.lens = el.dataset.v as 'cap' | 'repo';
        state.focus = 'root';
        state.sel = null;
        buildScene();
        frameFocus();
      }
      return;
    }
    const ds = el.dataset;
    if (el.id === 'up') goUp();
    else if (el.id === 'stalePill') {
      const m = modules.find((x) => x.stale);
      if (m) goTo(m.id);
    } else if (ds.focus) {
      state.hl = null;
      state.focus = ds.focus;
      state.sel = null;
      state.flow = '';
      applyState();
    } else if (ds.flow !== undefined) showFlow(ds.flow);
    else if (ds.go) goTo(ds.go);
    else if (ds.step) {
      state.step = +ds.step;
      applyState();
    } else if (ds.stepby) stepBy(+ds.stepby);
    else if (ds.close !== undefined) {
      state.sel = null;
      applyState();
    }
  });
  const flowSel = $<HTMLSelectElement>('flowSel');
  flowSel.addEventListener('change', () => showFlow(flowSel.value));
}
