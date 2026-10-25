// The chat panel. It talks to serve.ts, which runs the user's own agent read-only in the
// project. Answers can cite modules, light them up, draft a flow, and modules get described
// the first time they are opened.
import type { ChatEvent, ChatRequest, DescribeResponse, Flow, FlowDraft, SaveFlowResponse } from '../types.ts';
import { CAP, D, esc, FLOW, modLabel, N, repoOf } from './data.ts';
import { L, suggestions, t } from './i18n.ts';
import { state } from './state.ts';
import type { TreeNode } from './tree.ts';
import { view } from './tree.ts';
import { applyState, light, showFlow } from './nav.ts';
import { conf, renderCaption, renderUI, sw } from './panels.ts';

const served = location.protocol.startsWith('http');
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const msgsEl = $('msgs'), qEl = $<HTMLTextAreaElement>('q'), sendEl = $<HTMLButtonElement>('send');
let session: string | null = null, busy = false;
try { session = sessionStorage.getItem('atlasChat'); } catch { /* no persistence */ }

const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// ---------- rendering answers ----------
function citeLabel(id: string) {
  if (id.startsWith('cap:')) { const c = CAP[id.slice(4)]; return c ? L(c, 'name') : null; }
  return N[id] ? modLabel(id) : null;
}
/** Tiny markdown: paragraphs, lists, `code`, **bold**, and [[atlas-id]] as links into the scene. */
function md(src: string) {
  const inline = (s: string) => esc(s)
    .replace(/\[\[([^\]]+)\]\]/g, (_, id: string) => {
      const l = citeLabel(id);
      return l ? `<button class="cite" data-go="${esc(id)}">${id.startsWith('cap:') ? '◇' : sw(repoOf(id))}${esc(l)}</button>` : `<code>${esc(id)}</code>`;
    })
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const out: string[] = [];
  let list: 'ol' | 'ul' | null = null;
  for (const line of src.split('\n')) {
    const li = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);
    if (li) { if (!list) { list = /^\s*\d/.test(line) ? 'ol' : 'ul'; out.push(`<${list}>`); } out.push(`<li>${inline(li[1])}</li>`); continue; }
    if (list) { out.push(`</${list}>`); list = null; }
    if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push(`</${list}>`);
  return out.join('');
}

// A drafted flow arrives as a fenced atlas-flow block; while streaming, hide it until it closes.
function splitFlow(text: string): { text: string; raw: FlowDraft | null } {
  const m = text.match(/```atlas-flow\s*([\s\S]*?)```/);
  if (m) { try { return { text: text.replace(m[0], ''), raw: JSON.parse(m[1]) }; } catch { return { text: text.replace(m[0], ''), raw: null }; } }
  const open = text.indexOf('```atlas-flow');
  return { text: open >= 0 ? text.slice(0, open) : text, raw: null };
}
function toFlow(raw: FlowDraft): Flow {
  const id = (raw.id || raw.name_en || 'flow').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id, name: raw.name_pt || raw.name_en || id, name_en: raw.name_en || raw.name_pt, biz: raw.biz_pt || raw.biz_en, biz_en: raw.biz_en || raw.biz_pt,
    confidence: raw.confidence === 'verified' ? 'verified' : 'inferred',
    steps: (raw.steps || []).filter((x) => N[x.unit]).map((x) => ({ unit: x.unit, text: x.text_pt || x.text_en || '', text_en: x.text_en || x.text_pt, anchor: x.anchor || null })),
  };
}
const draftCard = (f: Flow) => `<div class="draftCard"><div class="k">${t('draft')} ${conf(f.confidence)}</div><b>${esc(L(f, 'name'))}</b><p>${esc(L(f, 'biz'))}</p>
  <ol>${f.steps.map((x) => `<li>${esc(L(x, 'text'))} <span class="muted">· ${esc(modLabel(x.unit))}</span></li>`).join('')}</ol>
  <div class="acts"><button data-preview="${esc(f.id)}">${t('preview')}</button><button class="pri" data-saveflow="${esc(f.id)}">${t('saveFlow')}</button></div></div>`;

// The agent ends with "SHOW: id, id" when its answer is about specific modules.
function splitShow(text: string) {
  const m = text.match(/\n?\s*SHOW:\s*(.+)\s*$/);
  if (!m) return { body: text, ids: [] as string[] };
  return { body: text.slice(0, m.index), ids: m[1].split(/[,\s]+/).map((x) => x.replace(/^\[\[|\]\]$/g, '')).filter((id) => N[id] || CAP[id.slice(4)]) };
}

function aboutNow() {
  const n = view.T[state.sel ?? ''] || view.T[state.focus];
  if (!n || n === view.root) return null;
  return { id: n.id, kind: n.kind, label: n.kind === 'module' ? modLabel(n.id) : n.kind === 'file' ? n.file!.path : n.name };
}

export function renderChat() {
  qEl.placeholder = t('placeholder');
  const a = aboutNow();
  $('about').innerHTML = a ? `${t('about')}: <b>${esc(a.label)}</b>` : '';
  if (!msgsEl.children.length && !busy) {
    msgsEl.innerHTML = served
      ? `<div class="sugg">${[...suggestions(), ...(D.config.suggestions[state.lang] || [])].map((q) => `<button data-ask="${esc(q)}">${esc(q)}</button>`).join('')}</div>`
      : `<p class="empty">${t('needServe')}</p>`;
  }
  sendEl.disabled = busy || !served;
}
export const focusChat = () => qEl.focus();

async function ask(q: string) {
  if (busy || !q.trim() || !served) return;
  if (msgsEl.querySelector('.sugg, .empty')) msgsEl.innerHTML = '';
  busy = true; renderChat();
  msgsEl.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(q)}</div><div class="msg bot"><div class="status">${t('thinking')}</div><div class="body"></div></div>`);
  const bot = msgsEl.lastElementChild as HTMLElement, status = bot.querySelector('.status')!, body = bot.querySelector('.body')!;
  msgsEl.scrollTop = msgsEl.scrollHeight;
  const a = aboutNow();
  let text = '';
  try {
    const req: ChatRequest = { message: q, session, lang: state.lang, about: a ? `${a.kind} ${a.id} (${a.label})` : null };
    const res = await post('/chat', req);
    const reader = res.body!.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const ev: ChatEvent = JSON.parse(buf.slice(0, nl)); buf = buf.slice(nl + 1);
        if (ev.type === 'status') status.textContent = ev.text;
        else if (ev.type === 'delta') { text += ev.text; body.innerHTML = md(splitShow(splitFlow(text).text).body); }
        else {
          if (ev.session) { session = ev.session; try { sessionStorage.setItem('atlasChat', session); } catch { /* no persistence */ } }
          if (ev.text) text = ev.text;
          if (ev.error) text = text || `${t('chatErr')} (${ev.error})`;
        }
      }
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }
  } catch (e) { text = text || `${t('chatErr')}: ${(e as Error).message}`; }
  status.remove();
  const fl = splitFlow(text);
  const { body: answer, ids } = splitShow(fl.text);
  body.innerHTML = md(answer);
  if (fl.raw) {
    const f = toFlow(fl.raw);
    if (f.steps.length) { FLOW[f.id] = f; bot.insertAdjacentHTML('beforeend', draftCard(f)); }
  }
  if (ids.length) {
    bot.insertAdjacentHTML('beforeend', `<div class="lit">● ${ids.length} ${t('lit')} <button data-relight="${esc(ids.join(','))}">↺</button> <button data-unlight>${t('clear')}</button></div>`);
    light(ids);
  }
  busy = false; renderChat();
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

async function saveDraft(btn: HTMLButtonElement) {
  const f = FLOW[btn.dataset.saveflow!];
  btn.disabled = true; btn.textContent = t('saving');
  try {
    const r = await post('/flows', f);
    const got: SaveFlowResponse = await r.json();
    if (!r.ok || !got.ok) throw new Error(got.log.join(' ') || String(r.status));
    if (!D.flows.some((x) => x.id === f.id)) D.flows.push(f);
    btn.textContent = t('saved');
    renderUI();
  } catch (e) { btn.disabled = false; btn.textContent = `${t('saveErr')} (${(e as Error).message})`; }
}

// ---------- descriptions on demand ----------
// Opening a module with no description asks the agent to read it and describe it and its files, once.
// A failure is retried once (the next render), then left alone.
export const describing = new Set<string>();
const failedOnce = new Set<string>(), gaveUp = new Set<string>();
export async function ensureDescribed(n: TreeNode | null | undefined) {
  if (!served || !n || n.kind !== 'module' || describing.has(n.id) || gaveUp.has(n.id)) return;
  const m = n.ref!;
  if (m.desc && m.files.every((f) => f.desc)) return;
  describing.add(n.id); renderCaption();
  try {
    const r = await post('/describe', { id: n.id });
    if (!r.ok) throw new Error(String(r.status));
    const got: DescribeResponse = await r.json();
    if (got.module && !m.desc) m.desc = got.module;
    for (const f of m.files) if (got.files[f.path]) f.desc = got.files[f.path];
  } catch { (failedOnce.has(n.id) ? gaveUp : failedOnce).add(n.id); }
  describing.delete(n.id);
  renderUI();
}

export function wireChat() {
  const form = $<HTMLFormElement>('ask');
  form.addEventListener('submit', (e) => { e.preventDefault(); const q = qEl.value; qEl.value = ''; qEl.style.height = ''; void ask(q); });
  qEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  qEl.addEventListener('input', () => { qEl.style.height = 'auto'; qEl.style.height = Math.min(qEl.scrollHeight, 120) + 'px'; });
  msgsEl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-ask],[data-relight],[data-unlight],[data-preview],[data-saveflow]');
    if (!b) return;
    const ds = b.dataset;
    if (ds.ask) void ask(ds.ask);
    else if (ds.relight) light(ds.relight.split(','));
    else if (ds.unlight !== undefined) { state.hl = null; applyState(); }
    else if (ds.preview) showFlow(ds.preview);
    else if (ds.saveflow) void saveDraft(b);
  });
}
