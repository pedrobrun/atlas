import type { Lang } from '../types.ts';
import { D, FLOW } from './data.ts';

export interface State {
  lens: 'cap' | 'repo';
  lang: Lang;
  focus: string;
  sel: string | null;
  flow: string;
  step: number;
  hl: string[] | null;
  panel: 'ask' | 'details' | null;
}

const KEY = 'atlas3d';
export const state: State = {
  lens: 'cap',
  lang: D.config.lang,
  focus: 'root',
  sel: null,
  flow: '',
  step: 0,
  hl: null,
  panel: null,
};
function restore(saved: unknown) {
  if (typeof saved !== 'object' || saved === null) return;
  const s: Record<string, unknown> = { ...saved };
  const text = (v: unknown) => (typeof v === 'string' ? v : null);
  if (s.lens === 'cap' || s.lens === 'repo') state.lens = s.lens;
  if (s.lang === 'en' || s.lang === 'pt') state.lang = s.lang;
  if (s.panel === 'ask' || s.panel === 'details' || s.panel === null) state.panel = s.panel;
  state.focus = text(s.focus) ?? state.focus;
  state.sel = text(s.sel);
  const flow = text(s.flow);
  state.flow = flow && FLOW[flow] ? flow : '';
  if (typeof s.step === 'number') state.step = s.step;
  if (Array.isArray(s.hl)) state.hl = s.hl.filter((id): id is string => typeof id === 'string');
}
try {
  restore(JSON.parse(sessionStorage.getItem(KEY) || '{}'));
} catch {
  /* private window or corrupt entry: start fresh */
}

export const save = () => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
};
