// Dependency arcs (for the hovered or opened module) and the lit path of a flow.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { D, esc } from './data.ts';
import { state } from './state.ts';
import type { TreeNode } from './tree.ts';
import { modulesUnder, view } from './tree.ts';
import { stepModules } from './roles.ts';
import { nav } from './nav.ts';
import { scene } from './scene.ts';

let group: THREE.Group | null = null;
const moving: { curve: THREE.QuadraticBezierCurve3; pulse: THREE.Mesh; off: number }[] = [];
const USES = 0x5b50e8,
  USED_BY = 0x14a08e,
  FLOW_COLOR = 0xe5487f;

/** Nearest visible tree node for a module id. */
function visibleProxy(id: string): TreeNode | null {
  for (let n: TreeNode | null = view.T[id]; n && n.kind !== 'root'; n = n.parent) {
    const r = nav.roles[n.id];
    if (r && r !== 'hidden' && n.kind !== 'group') return n;
  }
  return null;
}
const topOf = (n: TreeNode) => new THREE.Vector3(n.x, n.y + n.h * n.cur.sy + 0.05, n.z);

function clear() {
  if (!group) {
    group = new THREE.Group();
    scene.add(group);
  }
  for (const c of [...group.children]) {
    group.remove(c);
    if (c instanceof THREE.Mesh) c.geometry.dispose();
    if (c instanceof CSS2DObject) c.element.remove();
  }
  moving.length = 0;
}

// Arcs scale with what is in view, so they read the same zoomed in or out.
function viewScale() {
  const f = state.flow ? view.root : view.T[state.focus] || view.root;
  return Math.min(1.2, Math.max(0.22, Math.max(f.w || 40, f.d || 40) / 14));
}
function arc(a: THREE.Vector3, b: THREE.Vector3, color: number, w: number, label: string | null) {
  const sc = viewScale();
  const mid = a.clone().lerp(b, 0.5);
  mid.y = Math.max(a.y, b.y) + (0.6 + a.distanceTo(b) * 0.28) * Math.max(sc, 0.5);
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  group!.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(curve, 48, (0.02 + Math.log2(1 + w) * 0.02) * sc, 6, false),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 }),
    ),
  );
  const pulse = new THREE.Mesh(
    new THREE.SphereGeometry((0.07 + Math.log2(1 + w) * 0.025) * sc, 12, 10),
    new THREE.MeshBasicMaterial({ color }),
  );
  group!.add(pulse);
  moving.push({ curve, pulse, off: Math.random() });
  if (label) {
    const el = document.createElement('div');
    el.className = 'lab arc';
    el.innerHTML = `<span class="n">${esc(label)}</span>`;
    const o = new CSS2DObject(el);
    o.position.copy(b).add(new THREE.Vector3(0, 0.35, 0));
    group!.add(o);
  }
}

export function drawArcs() {
  clear();
  const { T } = view;
  if (state.flow) {
    const steps = stepModules()
      .map((id) => T[id])
      .filter(Boolean);
    for (let i = 1; i < steps.length; i++)
      if (steps[i] !== steps[i - 1]) arc(topOf(steps[i - 1]), topOf(steps[i]), FLOW_COLOR, 6, null);
    return;
  }
  const h = nav.hovered;
  const src =
    h?.kind === 'module'
      ? h
      : T[state.sel ?? '']?.kind === 'module'
        ? T[state.sel!]
        : T[state.focus]?.kind === 'module'
          ? T[state.focus]
          : null;
  if (!src) return;
  // Edges leaving or entering the module, gathered per visible target (a module, or the box hiding it).
  const mine = new Set(modulesUnder(src));
  const outs = new Map<TreeNode, { w: number; names: Set<string> }>(),
    ins = new Map<TreeNode, { w: number; names: Set<string> }>();
  for (const e of D.edges) {
    const o = mine.has(e.from) && !mine.has(e.to),
      i = mine.has(e.to) && !mine.has(e.from);
    if (!o && !i) continue;
    const p = visibleProxy(o ? e.to : e.from);
    if (!p || p === src) continue;
    const m = o ? outs : ins;
    const cur = m.get(p) ?? { w: 0, names: new Set<string>() };
    cur.w += e.w;
    cur.names.add(o ? e.to : e.from);
    m.set(p, cur);
  }
  const a = topOf(src);
  const lab = (p: TreeNode, v: { names: Set<string> }) =>
    p.kind === 'module' ? null : `${p.name}${v.names.size > 1 ? ` · ${v.names.size}` : ''}`;
  for (const [p, v] of outs) arc(a, topOf(p), USES, v.w, lab(p, v));
  for (const [p, v] of ins) arc(topOf(p), a, USED_BY, v.w, lab(p, v));
}

export function animateArcs(t: number) {
  for (const m of moving) m.pulse.position.copy(m.curve.getPoint((t * 0.45 + m.off) % 1));
}
