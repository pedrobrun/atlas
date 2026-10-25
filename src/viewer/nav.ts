// Moving around the map, and turning the state into roles, highlights and labels.
import { FLOW, modLabel } from './data.ts';
import { save, state } from './state.ts';
import type { TreeNode } from './tree.ts';
import { countLoc, ENTER, inside, view } from './tree.ts';
import type { Role } from './roles.ts';
import { computeRoles, litSet, ROLE, stepModules } from './roles.ts';
import { baseEmissive, frameFocus } from './scene.ts';
import { drawArcs } from './arcs.ts';
import { renderUI } from './panels.ts';

/** Shared, frame-to-frame view state. */
export const nav = { roles: {} as Record<string, Role>, hovered: null as TreeNode | null };

/** Applies the state to the scene. `instant` skips easing and the camera flight. */
export function applyState(instant = false) {
  save();
  const { T, root } = view;
  const roles = (nav.roles = computeRoles());
  const steps = stepModules();
  const lit = litSet();
  const f = T[state.focus] || root;
  for (const n of Object.values(T)) {
    if (n.kind === 'root' || !n.mesh) continue;
    const r = roles[n.id];
    Object.assign(n.tgt, ROLE[r]);
    if (r !== 'hidden') n.mesh.visible = true;
    if (instant) Object.assign(n.cur, n.tgt);
    n.inFlow = !!state.flow && steps.includes(n.id);
    n.curStep = !!state.flow && steps[state.step] === n.id;
    n.lit = lit.has(n.id);
    n.mesh.material.emissive.setHex(baseEmissive(n));
    if (n.label) label(n, r, f, lit, steps);
  }
  renderUI();
  drawArcs();
  if (!instant) frameFocus();
}

// Which boxes get a floating name, and how it looks.
function label(n: TreeNode, r: Role, f: TreeNode, lit: Set<string>, steps: string[]) {
  const el = n.label!.element;
  const childOfFocus = n.parent === f || (n.parent?.kind === 'group' && n.parent.parent === f);
  let show = false, cls = 'lab';
  if (lit.size && n.kind === 'module') { show = lit.has(n.id); cls += ' hl small'; }
  else if (lit.size && r === 'district' && n.parent !== view.root) show = false;
  else if (state.flow) { show = r === 'closed' || r === 'shell'; if (r === 'closed') cls += n.curStep ? ' step big' : ' step'; if (r === 'shell') cls += ' ctx big'; }
  else if (r === 'district') { show = true; if (n.parent === view.root) cls += ' big'; }
  else if (r === 'closed' && f === view.root && n.kind === 'module') { show = state.lens === 'cap' && countLoc(n) >= 450; cls += ' small'; }
  else if (r === 'closed' && childOfFocus) { show = true; if (n.kind === 'file' || n.kind === 'module') cls += ' small'; if (n.kind === 'cap' || n.kind === 'repo') cls += ' big'; }
  else if (r === 'context' && n.parent === (f.parent || view.root) && n.kind !== 'group') { show = true; cls += ' ctx'; }
  el.className = cls;
  n.label!.visible = show;
  if (!show) return;
  let name = n.kind === 'module' && state.flow ? modLabel(n.id) : n.name;
  if (state.flow && r === 'closed') name = `${steps.flatMap((s, i) => (s === n.id ? [i + 1] : [])).join(' · ')}  ${modLabel(n.id)}`;
  el.querySelector('.n')!.textContent = name;
  el.querySelector('.s')!.textContent = '';
}

/** Opens a box; a file is selected inside its module. */
export function open(n: TreeNode) {
  state.hl = null;
  if (ENTER.has(n.kind)) { state.focus = n.id; state.sel = null; }
  else { state.focus = (n.parent && ENTER.has(n.parent.kind) ? n.parent : n.parent?.parent || view.root).id; state.sel = n.id; }
  nav.hovered = null;
  applyState();
}

/** Esc: always one level out — flow, highlight, file, then up the tree. */
export function goUp() {
  if (state.flow) state.flow = '';
  else if (state.hl?.length) state.hl = null;
  else if (state.sel) state.sel = null;
  else {
    let p = view.T[state.focus]?.parent;
    while (p && p.kind === 'group') p = p.parent;
    state.focus = p ? p.id : 'root';
  }
  applyState();
}

export function goTo(id: string) {
  state.flow = '';
  if (!view.T[id]) { // a capability in the repos lens: light its modules instead
    if (id.startsWith('cap:')) { state.hl = [id]; state.focus = 'root'; applyState(); }
    return;
  }
  state.hl = null; state.focus = id; state.sel = null;
  applyState();
}

export function stepBy(d: number) {
  const f = FLOW[state.flow];
  if (!f) return;
  state.step = Math.max(0, Math.min(f.steps.length - 1, state.step + d));
  applyState();
}

/** Lights modules up, backing out only as far as needed to show them all. */
export function light(ids: string[]) {
  state.flow = ''; state.sel = null; state.hl = ids;
  const lit = [...litSet()];
  let f = view.T[state.focus] || view.root;
  while (f !== view.root && (f.kind === 'group' || !lit.every((id) => inside(id, f)))) f = f.parent!;
  state.focus = f.id;
  applyState();
}

export function showFlow(id: string) {
  state.hl = null; state.sel = null; state.flow = id; state.step = 0;
  if (!id) state.focus = 'root';
  applyState();
}
