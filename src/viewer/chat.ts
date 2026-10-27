import type { ChatEvent, ChatRequest, DescribeResponse, Flow, SaveFlowResponse } from '../types.ts';
import { addDraftFlow, CAP, D, FLOW, modLabel, N, repoOf } from './data.ts';
import { byId, esc } from './dom.ts';
import { L, suggestions, t } from './i18n.ts';
import { state } from './state.ts';
import type { TreeNode } from './tree.ts';
import { view } from './tree.ts';
import { applyState, light, showFlow } from './nav.ts';
import { renderCaption, renderUI } from './panels.ts';
import { confidenceChip, repoDot } from './html.ts';
import { readAnswer, toFlow } from './answer.ts';

let served = false;
if (location.protocol.startsWith('http')) {
  fetch('/health')
    .then((r) => r.ok && r.headers.get('content-type')?.includes('json'))
    .then((ok) => {
      served = !!ok;
      messages.querySelector('.empty')?.remove();
      renderChat();
    })
    .catch(() => {});
}
const messages = byId('msgs');
const input = byId<HTMLTextAreaElement>('q');
const send = byId<HTMLButtonElement>('send');
let session: string | null = null;
let busy = false;
try {
  session = sessionStorage.getItem('atlasChat');
} catch {}

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const inMap = (id: string) => !!N[id] || !!CAP[id.slice(4)];
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function citation(id: string) {
  if (id.startsWith('cap:')) {
    const cap = CAP[id.slice(4)];
    return cap && `<button class="cite" data-go="${esc(id)}">◇${esc(L(cap, 'name'))}</button>`;
  }
  return (
    N[id] && `<button class="cite" data-go="${esc(id)}">${repoDot(repoOf(id))}${esc(modLabel(id))}</button>`
  );
}
const inline = (s: string) =>
  esc(s)
    .replace(/\[\[([^\]]+)\]\]/g, (_, id: string) => citation(id) || `<code>${esc(id)}</code>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

function markdown(src: string) {
  const out: string[] = [];
  let list: 'ol' | 'ul' | null = null;
  for (const line of src.split('\n')) {
    const item = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);
    if (item) {
      if (!list) {
        list = /^\s*\d/.test(line) ? 'ol' : 'ul';
        out.push(`<${list}>`);
      }
      out.push(`<li>${inline(item[1])}</li>`);
      continue;
    }
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
    if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push(`</${list}>`);
  return out.join('');
}

function draftCard(f: Flow) {
  const steps = f.steps
    .map((s) => `<li>${esc(L(s, 'text'))} <span class="muted">· ${esc(modLabel(s.unit))}</span></li>`)
    .join('');
  return [
    `<div class="draftCard"><div class="k">${t('draft')} ${confidenceChip(f.confidence)}</div>`,
    `<b>${esc(L(f, 'name'))}</b><p>${esc(L(f, 'biz'))}</p><ol>${steps}</ol>`,
    `<div class="acts"><button data-preview="${esc(f.id)}">${t('preview')}</button>`,
    `<button class="pri" data-saveflow="${esc(f.id)}">${t('saveFlow')}</button></div></div>`,
  ].join('');
}

function litNote(ids: string[]) {
  const relight = `<button data-relight="${esc(ids.join(','))}">↺</button>`;
  const clear = `<button data-unlight>${t('clear')}</button>`;
  return `<div class="lit">● ${ids.length} ${t('lit')} ${relight} ${clear}</div>`;
}

function aboutNow() {
  const n = view.T[state.sel ?? ''] || view.T[state.focus];
  if (!n || n === view.root) return null;
  const label = n.kind === 'module' ? modLabel(n.id) : n.kind === 'file' ? n.file.path : n.name;
  return { id: n.id, kind: n.kind, label };
}

export function renderChat() {
  input.placeholder = t('placeholder');
  const about = aboutNow();
  byId('about').innerHTML = about ? `${t('about')}: <b>${esc(about.label)}</b>` : '';
  if (!messages.children.length && !busy) {
    const questions = [...suggestions(), ...(D.config.suggestions[state.lang] || [])];
    messages.innerHTML = served
      ? `<div class="sugg">${questions.map((q) => `<button data-ask="${esc(q)}">${esc(q)}</button>`).join('')}</div>`
      : `<p class="empty">${t('needServe')}</p>`;
  }
  send.disabled = busy || !served;
}
export const focusChat = () => input.focus();

async function streamChat(req: ChatRequest, onEvent: (e: ChatEvent) => void) {
  const res = await post('/chat', req);
  if (!res.body) throw new Error(String(res.status));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    pending += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = pending.indexOf('\n')) >= 0) {
      onEvent(JSON.parse(pending.slice(0, nl)));
      pending = pending.slice(nl + 1);
    }
  }
}

function rememberSession(id: string) {
  session = id;
  try {
    sessionStorage.setItem('atlasChat', id);
  } catch {}
}

async function ask(question: string) {
  if (busy || !question.trim() || !served) return;
  if (messages.querySelector('.sugg, .empty')) messages.innerHTML = '';
  busy = true;
  renderChat();
  const bot = document.createElement('div');
  const status = document.createElement('div');
  const body = document.createElement('div');
  bot.className = 'msg bot';
  status.className = 'status';
  status.textContent = t('thinking');
  body.className = 'body';
  bot.append(status, body);
  messages.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(question)}</div>`);
  messages.append(bot);
  const scroll = () => (messages.scrollTop = messages.scrollHeight);
  scroll();

  const about = aboutNow();
  let text = '';
  try {
    const req: ChatRequest = {
      message: question,
      session,
      lang: state.lang,
      about: about && `${about.kind} ${about.id} (${about.label})`,
    };
    await streamChat(req, (e) => {
      if (e.type === 'status') status.textContent = e.text;
      else if (e.type === 'delta') {
        text += e.text;
        body.innerHTML = markdown(readAnswer(text, inMap).body);
      } else {
        if (e.session) rememberSession(e.session);
        if (e.text) text = e.text;
        if (e.error) text = text || `${t('chatErr')} (${e.error})`;
      }
      scroll();
    });
  } catch (e) {
    text = text || `${t('chatErr')}: ${errorText(e)}`;
  }
  status.remove();

  const answer = readAnswer(text, inMap);
  body.innerHTML = markdown(answer.body);
  const flow = answer.draft && toFlow(answer.draft, (id) => !!N[id]);
  if (flow?.steps.length) {
    addDraftFlow(flow);
    bot.insertAdjacentHTML('beforeend', draftCard(flow));
  }
  if (answer.show.length) {
    bot.insertAdjacentHTML('beforeend', litNote(answer.show));
    light(answer.show);
  }
  busy = false;
  renderChat();
  scroll();
}

async function saveDraft(button: HTMLButtonElement, id: string) {
  const flow = FLOW[id];
  button.disabled = true;
  button.textContent = t('saving');
  try {
    const res = await post('/flows', flow);
    const saved: SaveFlowResponse = await res.json();
    if (!res.ok || !saved.ok) throw new Error(saved.log.join(' ') || String(res.status));
    if (!D.flows.some((f) => f.id === id)) D.flows.push(flow);
    button.textContent = t('saved');
    renderUI();
  } catch (e) {
    button.disabled = false;
    button.textContent = `${t('saveErr')} (${errorText(e)})`;
  }
}

const DESCRIBE_TIMEOUT_MS = 5 * 60_000;
const MAX_ATTEMPTS = 2;

export type DescribeStatus = { seconds: number } | { failed: string };
const running = new Map<string, number>();
const attempts = new Map<string, number>();
const failures = new Map<string, string>();
let ticker: ReturnType<typeof setInterval> | undefined;

export function describeStatus(id: string): DescribeStatus | null {
  const since = running.get(id);
  if (since !== undefined) return { seconds: Math.round((Date.now() - since) / 1000) };
  const failed = failures.get(id);
  return failed === undefined ? null : { failed };
}

async function describe(id: string): Promise<DescribeResponse> {
  const res = await fetch('/describe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
    signal: AbortSignal.timeout(DESCRIBE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error((await res.text()).split('\n')[0] || `HTTP ${res.status}`);
  return res.json();
}

export async function ensureDescribed(n: TreeNode | null | undefined) {
  if (!served || n?.kind !== 'module' || running.has(n.id)) return;
  const m = n.ref;
  if (m.desc && m.files.every((f) => f.desc)) return;
  const tries = attempts.get(n.id) ?? 0;
  if (tries >= MAX_ATTEMPTS) return;
  attempts.set(n.id, tries + 1);
  running.set(n.id, Date.now());
  ticker ??= setInterval(renderCaption, 1000);
  renderCaption();
  try {
    const got = await describe(n.id);
    if (got.module && !m.desc) m.desc = got.module;
    for (const f of m.files) if (got.files[f.path]) f.desc = got.files[f.path];
    failures.delete(n.id);
  } catch (e) {
    failures.set(
      n.id,
      e instanceof DOMException && e.name === 'TimeoutError' ? t('describeSlow') : errorText(e),
    );
  }
  running.delete(n.id);
  if (!running.size) {
    clearInterval(ticker);
    ticker = undefined;
  }
  renderUI();
}

export function wireChat() {
  const form = byId<HTMLFormElement>('ask');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const question = input.value;
    input.value = '';
    input.style.height = '';
    void ask(question);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
  messages.addEventListener('click', (e) => {
    const selector = '[data-ask],[data-relight],[data-unlight],[data-preview],[data-saveflow]';
    const button = e.target instanceof Element ? e.target.closest<HTMLButtonElement>(selector) : null;
    if (!button) return;
    const ds = button.dataset;
    if (ds.ask) void ask(ds.ask);
    else if (ds.relight) light(ds.relight.split(','));
    else if (ds.unlight !== undefined) {
      state.hl = null;
      applyState();
    } else if (ds.preview) showFlow(ds.preview);
    else if (ds.saveflow) void saveDraft(button, ds.saveflow);
  });
}
