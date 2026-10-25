// Moving around the map, and turning the state into roles, highlights and labels.
import { FLOW, modLabel } from './data.ts';
import { save, state } from './state.ts';
import type { Mark, TreeNode } from './tree.ts';
import { countLoc, ENTER, inside, view } from './tree.ts';
import type { Role } from './roles.ts';
import { computeRoles, litSet, ROLE, stepModules } from './roles.ts';
import { frameFocus, setGlow } from './scene.ts';
import { drawArcs } from './arcs.ts';
import { renderUI } from './panels.ts';

/** Applies the state to the scene. `instant` skips easing and the camera flight. */
export function applyState(instant = false) {
  save();
  const roles = (view.roles = computeRoles());
  const steps = stepModules();
  const lit = litSet();
  const focus = view.T[state.focus] || view.root;
  for (const n of Object.values(view.T)) {
    if (!n.gfx) continue;
    const role = roles[n.id];
    Object.assign(n.tgt, ROLE[role]);
    if (role !== 'hidden') n.gfx.mesh.visible = true;
    if (instant) Object.assign(n.cur, n.tgt);
    n.mark = markOf(n.id, steps, lit);
    setGlow(n);
    const label = n.gfx.label;
    if (!label) continue;
    const look = labelFor(n, role, focus, lit, steps);
    label.visible = !!look;
    if (!look) continue;
    label.element.className = look.cls;
    label.element.querySelector('.n')!.textContent = look.text;
  }
  renderUI();
  drawArcs();
  if (!instant) frameFocus();
}

function markOf(id: string, steps: string[], lit: Set<string>): Mark {
  if (state.flow) return steps[state.step] === id ? 'step' : steps.includes(id) ? 'flow' : 'none';
  return lit.has(id) ? 'lit' : 'none';
}

// Which boxes get a floating name, and how it looks; null when the box shows none.
function labelFor(n: TreeNode, role: Role, focus: TreeNode, lit: Set<string>, steps: string[]) {
  const isChildOfFocus = n.parent === focus || (n.parent?.kind === 'group' && n.parent.parent === focus);
  if (lit.size && n.kind === 'module') return lit.has(n.id) ? { cls: 'lab hl small', text: n.name } : null;
  if (lit.size && role === 'district' && n.parent !== view.root) return null;
  if (state.flow) {
    if (role === 'shell') return { cls: 'lab ctx big', text: n.name };
    if (role !== 'closed') return null;
    const positions = steps.flatMap((s, i) => (s === n.id ? [i + 1] : [])).join(' · ');
    return { cls: n.mark === 'step' ? 'lab step big' : 'lab step', text: `${positions}  ${modLabel(n.id)}` };
  }
  if (role === 'district') return { cls: n.parent === view.root ? 'lab big' : 'lab', text: n.name };
  if (role === 'closed' && focus === view.root && n.kind === 'module') {
    return state.lens === 'cap' && countLoc(n) >= 450 ? { cls: 'lab small', text: n.name } : null;
  }
  if (role === 'closed' && isChildOfFocus) {
    const size =
      n.kind === 'file' || n.kind === 'module'
        ? ' small'
        : n.kind === 'cap' || n.kind === 'repo'
          ? ' big'
          : '';
    return { cls: 'lab' + size, text: n.name };
  }
  if (role === 'context' && n.parent === (focus.parent || view.root) && n.kind !== 'group') {
    return { cls: 'lab ctx', text: n.name };
  }
  return null;
}

/** Opens a box; a file is selected inside its module. */
export function open(n: TreeNode) {
  state.hl = null;
  if (ENTER.has(n.kind)) {
    state.focus = n.id;
    state.sel = null;
  } else {
    const holder = n.parent && ENTER.has(n.parent.kind) ? n.parent : n.parent?.parent || view.root;
    state.focus = holder.id;
    state.sel = n.id;
  }
  view.hovered = null;
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
  if (!view.T[id]) {
    // a capability in the repos lens: light its modules instead
    if (id.startsWith('cap:')) {
      state.hl = [id];
      state.focus = 'root';
      applyState();
    }
    return;
  }
  state.hl = null;
  state.focus = id;
  state.sel = null;
  applyState();
}

export function stepBy(d: number) {
  const flow = FLOW[state.flow];
  if (!flow) return;
  state.step = Math.max(0, Math.min(flow.steps.length - 1, state.step + d));
  applyState();
}

/** Lights modules up, backing out only as far as needed to show them all. */
export function light(ids: string[]) {
  state.flow = '';
  state.sel = null;
  state.hl = ids;
  const lit = [...litSet()];
  let focus = view.T[state.focus] || view.root;
  while (focus.parent && (focus.kind === 'group' || !lit.every((id) => inside(id, focus))))
    focus = focus.parent;
  state.focus = focus.id;
  applyState();
}

export function showFlow(id: string) {
  state.hl = null;
  state.sel = null;
  state.flow = id;
  state.step = 0;
  if (!id) state.focus = 'root';
  applyState();
}
