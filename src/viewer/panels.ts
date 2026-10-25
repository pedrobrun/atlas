import { isStale } from '../types.ts';
import { D, modules } from './data.ts';
import { byId, esc } from './dom.ts';
import { isKey, L, t } from './i18n.ts';
import { save, state } from './state.ts';
import { ancestors, view } from './tree.ts';
import { applyState, goTo, goUp, showFlow, stepBy } from './nav.ts';
import { buildScene, fitView, frameFocus } from './scene.ts';
import { captionHtml, detailsHtml } from './cards.ts';
import { describeStatus, ensureDescribed, focusChat, renderChat } from './chat.ts';

const card = byId('card');
const translate = (key: string | undefined) => (key && isKey(key) ? t(key) : '');

function renderBar() {
  document.documentElement.lang = state.lang === 'en' ? 'en' : 'pt-BR';
  for (const el of document.querySelectorAll<HTMLElement>('[data-t]'))
    el.textContent = translate(el.dataset.t);
  for (const el of document.querySelectorAll<HTMLElement>('[data-t-html]'))
    el.innerHTML = translate(el.dataset.tHtml);
  for (const button of document.querySelectorAll<HTMLElement>('#lens button, #lang button')) {
    const setting = button.closest('#lens') ? state.lens : state.lang;
    button.classList.toggle('on', button.dataset.v === setting);
  }
  const flowSel = byId<HTMLSelectElement>('flowSel');
  const options = D.flows.map((f) => `<option value="${esc(f.id)}">${esc(L(f, 'name'))}</option>`);
  flowSel.innerHTML = '<option value="">—</option>' + options.join('');
  flowSel.value = state.flow;
  const focus = view.T[state.focus] || view.root;
  const path = [focus, ...ancestors(focus)].filter((n) => n.kind !== 'group').reverse();
  byId('crumbs').innerHTML = path
    .map((n, i) => {
      const current = i === path.length - 1 ? 'cur' : '';
      const separator = i ? '<span class="sep">›</span>' : '';
      return `${separator}<button data-focus="${esc(n.id)}" class="${current}">${esc(n.name)}</button>`;
    })
    .join('');
  byId('up').hidden = focus === view.root && !state.flow && !state.sel;
  const stale = modules.filter(isStale).length;
  const pill = byId('stalePill');
  pill.hidden = !stale;
  pill.textContent = `${stale} ${t('stale')}`;
}

export function renderUI() {
  renderBar();
  card.innerHTML = detailsHtml();
  renderRail();
  renderChat();
  const selected = view.T[state.sel ?? ''];
  ensureDescribed(selected?.kind === 'file' ? selected.parent : view.T[state.focus]);
}

export function renderCaption() {
  const caption = byId('caption');
  caption.innerHTML = captionHtml(describeStatus);
  caption.hidden = !caption.innerHTML || state.panel === 'details';
}

export function renderRail() {
  card.classList.toggle('collapsed', state.panel !== 'details');
  byId('chat').classList.toggle('collapsed', state.panel !== 'ask');
  document.body.classList.toggle('paneled', !!state.panel);
  for (const b of document.querySelectorAll<HTMLElement>('#rail [data-panel]'))
    b.classList.toggle('on', b.dataset.panel === state.panel);
  renderCaption();
}
function togglePanel(panel: 'ask' | 'details') {
  state.panel = state.panel === panel ? null : panel;
  renderRail();
  fitView();
  save();
  if (state.panel === 'ask') focusChat();
}

function switchSetting(setting: 'lens' | 'lang', value: string) {
  if (setting === 'lang' && (value === 'en' || value === 'pt') && value !== state.lang) {
    state.lang = value;
    buildScene();
    applyState(true);
  }
  if (setting === 'lens' && (value === 'cap' || value === 'repo') && value !== state.lens) {
    state.lens = value;
    state.focus = 'root';
    state.sel = null;
    buildScene();
    applyState(true);
    frameFocus();
  }
}

function onClick(el: HTMLElement) {
  const ds = el.dataset;
  const setting = el.closest('#lens') ? 'lens' : el.closest('#lang') ? 'lang' : null;
  if (setting && ds.v) return switchSetting(setting, ds.v);
  if (el.id === 'up') return goUp();
  if (el.id === 'stalePill') {
    const first = modules.find(isStale);
    return first && goTo(first.id);
  }
  if (ds.focus) {
    state.hl = null;
    state.focus = ds.focus;
    state.sel = null;
    state.flow = '';
    return applyState();
  }
  if (ds.flow !== undefined) return showFlow(ds.flow);
  if (ds.go) return goTo(ds.go);
  if (ds.step) {
    state.step = +ds.step;
    return applyState();
  }
  if (ds.stepby) return stepBy(+ds.stepby);
  if (ds.close !== undefined) {
    state.sel = null;
    applyState();
  }
}

export function wirePanels() {
  byId('rail').addEventListener('click', (e) => {
    const panel =
      e.target instanceof Element ? e.target.closest<HTMLElement>('[data-panel]')?.dataset.panel : undefined;
    if (panel === 'ask' || panel === 'details') togglePanel(panel);
  });
  document.body.addEventListener('click', (e) => {
    const el =
      e.target instanceof Element &&
      e.target.closest<HTMLElement>(
        '[data-v],[data-focus],[data-flow],[data-go],[data-step],[data-stepby],[data-close],#up,#stalePill',
      );
    if (el) onClick(el);
  });
  const flowSel = byId<HTMLSelectElement>('flowSel');
  flowSel.addEventListener('change', () => showFlow(flowSel.value));
}
