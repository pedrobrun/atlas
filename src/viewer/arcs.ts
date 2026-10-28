import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { D, systemColor } from './data.ts';
import { esc } from './dom.ts';
import { state } from './state.ts';
import type { TreeNode } from './tree.ts';
import { inside, modulesUnder, view } from './tree.ts';
import { stepModules } from './roles.ts';
import { onFrame, scene } from './scene.ts';

const USES = 0x5b50e8;
const USED_BY = 0x14a08e;
const FLOW_COLOR = 0xe5487f;
const CALLS = 0xd9822b;

const group = new THREE.Group();
scene.add(group);
const pulses: { curve: THREE.QuadraticBezierCurve3; pulse: THREE.Mesh; offset: number }[] = [];
onFrame.push((t) => {
  for (const p of pulses) p.pulse.position.copy(p.curve.getPoint((t * 0.45 + p.offset) % 1));
});

function visibleProxy(id: string): TreeNode | null {
  for (let n: TreeNode | null = view.T[id]; n && n.kind !== 'root'; n = n.parent) {
    const role = view.roles[n.id];
    if (role && role !== 'hidden' && n.kind !== 'group') return n;
  }
  return null;
}
const topOf = (n: TreeNode) => new THREE.Vector3(n.x, n.y + n.h * n.cur.sy + 0.05, n.z);

function clear() {
  for (const c of [...group.children]) {
    group.remove(c);
    if (c instanceof THREE.Mesh) c.geometry.dispose();
    if (c instanceof CSS2DObject) c.element.remove();
  }
  pulses.length = 0;
}

function viewScale() {
  const f = state.flow ? view.root : view.T[state.focus] || view.root;
  return Math.min(1.2, Math.max(0.22, Math.max(f.w || 40, f.d || 40) / 14));
}

function arc(
  from: THREE.Vector3,
  to: THREE.Vector3,
  color: number,
  weight: number,
  label: string | null,
  quiet = false,
) {
  const scale = viewScale();
  const thickness = Math.log2(1 + weight);
  const mid = from.clone().lerp(to, 0.5);
  const rise = quiet ? 0.1 : 0.28;
  mid.y = Math.max(from.y, to.y) + (0.6 + from.distanceTo(to) * rise) * Math.max(scale, 0.5);
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
  const tube = new THREE.TubeGeometry(curve, 48, (0.02 + thickness * 0.02) * scale, 6, false);
  const opacity = quiet ? 0.22 : 0.75;
  group.add(new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color, transparent: true, opacity })));
  if (quiet) return;
  const pulse = new THREE.Mesh(
    new THREE.SphereGeometry((0.07 + thickness * 0.025) * scale, 12, 10),
    new THREE.MeshBasicMaterial({ color }),
  );
  group.add(pulse);
  pulses.push({ curve, pulse, offset: Math.random() });
  if (label) {
    const el = document.createElement('div');
    el.className = 'lab arc';
    el.innerHTML = `<span class="n">${esc(label)}</span>`;
    const tag = new CSS2DObject(el);
    tag.position.copy(to).add(new THREE.Vector3(0, 0.35, 0));
    group.add(tag);
  }
}

function drawFlowPath() {
  const steps = stepModules()
    .map((id) => view.T[id])
    .filter(Boolean);
  for (let i = 1; i < steps.length; i++) {
    if (steps[i] === steps[i - 1]) continue;
    const current = i === state.step;
    arc(topOf(steps[i - 1]), topOf(steps[i]), FLOW_COLOR, current ? 6 : 3, null, !current);
  }
}

function arcSource() {
  const candidates = [view.hovered, view.T[state.sel ?? ''], view.T[state.focus]];
  return candidates.find((n) => n?.kind === 'module' || n?.kind === 'external') ?? null;
}

function drawSystemLinks(scope: TreeNode) {
  const links = new Map<string, { from: TreeNode; to: TreeNode; weight: number }>();
  for (const e of D.edges) {
    if (e.kind !== 'calls' || !inside(e.from, scope)) continue;
    const from =
      scope === view.root
        ? view.root.children.find((c) => modulesUnder(c).includes(e.from))
        : visibleProxy(e.from);
    const to = view.T[e.to];
    if (!from || !to || from.kind === 'root') continue;
    const key = `${from.id}|${to.id}`;
    const link = links.get(key) ?? { from, to, weight: 0 };
    link.weight += e.w;
    links.set(key, link);
  }
  for (const l of links.values()) {
    const color = l.to.kind === 'external' ? systemColor(l.to.ref) : CALLS;
    arc(topOf(l.from), topOf(l.to), color, l.weight, null, true);
  }
}

export function drawArcs() {
  clear();
  if (state.flow) return drawFlowPath();
  const src = arcSource();
  if (!src && !state.hl?.length) return drawSystemLinks(view.T[state.focus] ?? view.root);
  if (!src) return;
  const mine = new Set(modulesUnder(src));
  type Link = { weight: number; modules: Set<string>; calls: boolean };
  const outgoing = new Map<TreeNode, Link>();
  const incoming = new Map<TreeNode, Link>();
  for (const e of D.edges) {
    const out = mine.has(e.from) && !mine.has(e.to);
    if (!out && !(mine.has(e.to) && !mine.has(e.from))) continue;
    const other = out ? e.to : e.from;
    const target = visibleProxy(other);
    if (!target || target === src) continue;
    const links = out ? outgoing : incoming;
    const link = links.get(target) ?? { weight: 0, modules: new Set<string>(), calls: false };
    link.weight += e.w;
    link.calls ||= e.kind === 'calls';
    link.modules.add(other);
    links.set(target, link);
  }
  const tag = (n: TreeNode, l: Link) =>
    n.kind === 'module' || n.kind === 'external'
      ? null
      : `${n.name}${l.modules.size > 1 ? ` · ${l.modules.size}` : ''}`;
  const here = topOf(src);
  for (const [n, l] of outgoing) arc(here, topOf(n), l.calls ? CALLS : USES, l.weight, tag(n, l));
  for (const [n, l] of incoming) arc(topOf(n), here, l.calls ? CALLS : USED_BY, l.weight, tag(n, l));
}
