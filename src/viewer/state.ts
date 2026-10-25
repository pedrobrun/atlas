// What the viewer is showing. Kept in sessionStorage so a reload lands in the same place.
import type { Lang } from '../types.ts';
import { D, FLOW } from './data.ts';

export interface State {
  lens: 'cap' | 'repo';
  lang: Lang;
  /** Tree node the view is opened on ('root' for the whole map). */
  focus: string;
  /** Selected file inside the focus, if any. */
  sel: string | null;
  /** Flow being toured, '' when none. */
  flow: string;
  step: number;
  /** Ids the chat asked to light up (modules or capabilities). */
  hl: string[] | null;
  panel: 'ask' | 'details' | null;
}

const KEY = 'atlas3d';
export const state: State = { lens: 'cap', lang: D.config.lang, focus: 'root', sel: null, flow: '', step: 0, hl: null, panel: null };
try { Object.assign(state, JSON.parse(sessionStorage.getItem(KEY) || '{}')); } catch { /* private window: start fresh */ }
if (state.flow && !FLOW[state.flow]) state.flow = '';

export const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* not persisted */ } };
