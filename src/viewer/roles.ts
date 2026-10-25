import type { Anim, TreeNode } from './tree.ts';
import { ancestors, linkedTo, modulesUnder, view } from './tree.ts';
import { FLOW, modules } from './data.ts';
import { state } from './state.ts';

export const ROLE = {
  hidden: { fill: 0, edge: 0, sy: 0.001 },
  closed: { fill: 1, edge: 0.5, sy: 1 },
  plate: { fill: 0.95, edge: 0.18, sy: 1 },
  glass: { fill: 0.06, edge: 0.65, sy: 1 },
  district: { fill: 0.045, edge: 0.42, sy: 1 },
  dim: { fill: 0.16, edge: 0.06, sy: 0.3 },
  shell: { fill: 0.025, edge: 0.18, sy: 1 },
  context: { fill: 0.1, edge: 0.1, sy: 1 },
  far: { fill: 0.035, edge: 0.05, sy: 1 },
  ghost: { fill: 0.07, edge: 0.08, sy: 1 },
} satisfies Record<string, Anim>;
export type Role = keyof typeof ROLE;

const DIMMABLE: Partial<Record<TreeNode['kind'], Role[]>> = {
  module: ['closed'],
  external: ['closed', 'context'],
};

export const PICKABLE = new Set<Role>(['closed', 'context', 'ghost', 'shell', 'far', 'district', 'dim']);

export const stepModules = () => FLOW[state.flow]?.steps.map((s) => s.unit) ?? [];

export function litSet(): Set<string> {
  const { T } = view;
  if (!state.hl?.length || state.flow) return new Set();
  return new Set(
    state.hl
      .flatMap((id) =>
        T[id] ? modulesUnder(T[id]) : modules.filter((m) => 'cap:' + m.cap === id).map((m) => m.id),
      )
      .filter((id) => T[id]),
  );
}

export function computeRoles(): Record<string, Role> {
  const { T, root } = view;
  const roles: Record<string, Role> = {};
  for (const id in T) roles[id] = 'hidden';
  const showInside = (n: TreeNode) => {
    for (const c of n.children) {
      if (c.kind === 'group') {
        roles[c.id] = 'plate';
        showInside(c);
      } else roles[c.id] = 'closed';
    }
  };
  const openDeep = (n: TreeNode) => {
    for (const c of n.children) {
      if (c.kind === 'group') {
        roles[c.id] = 'plate';
        openDeep(c);
      } else if (c.kind === 'module' || c.kind === 'external') roles[c.id] = 'closed';
      else {
        roles[c.id] = 'district';
        openDeep(c);
      }
    }
  };
  const dimUnlit = () => {
    const lit = litSet();
    if (!lit.size) return;
    for (const id in T) {
      if (!lit.has(id) && DIMMABLE[T[id].kind]?.includes(roles[id])) roles[id] = 'dim';
    }
  };

  if (state.flow) {
    const steps = new Set(stepModules());
    const anc = new Set<string>();
    for (const id of steps) if (T[id]) ancestors(T[id]).forEach((a) => anc.add(a.id));
    for (const c of root.children) roles[c.id] = anc.has(c.id) ? 'shell' : 'ghost';
    for (const id of anc) if (T[id]?.kind === 'group') roles[id] = 'context';
    for (const id of steps) if (T[id]) roles[id] = 'closed';
    return roles;
  }
  const f = T[state.focus] || root;
  if (f === root) {
    openDeep(root);
    dimUnlit();
    return roles;
  }
  roles[f.id] = 'glass';
  showInside(f);
  const faint = f.kind === 'module' || f.kind === 'area';
  for (const a of ancestors(f)) {
    if (a.kind !== 'root') roles[a.id] = a.kind === 'group' ? 'context' : 'shell';
    for (const s of a.children)
      if (roles[s.id] === 'hidden') roles[s.id] = faint && a !== root ? 'far' : 'context';
  }
  for (const c of root.children) {
    if (c.kind !== 'external') continue;
    roles[c.id] = linkedTo(c, f) ? 'closed' : 'far';
  }
  dimUnlit();
  return roles;
}
