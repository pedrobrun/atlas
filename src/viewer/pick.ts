// Hover and click on boxes in the scene.
import * as THREE from 'three';
import { modLabel } from './data.ts';
import { byId, esc } from './dom.ts';
import { L, t } from './i18n.ts';
import { state } from './state.ts';
import type { TreeNode } from './tree.ts';
import { descOf, ENTER, view } from './tree.ts';
import { PICKABLE, stepModules } from './roles.ts';
import { applyState, goUp, open, stepBy } from './nav.ts';
import { camera, renderer, setGlow } from './scene.ts';
import { drawArcs } from './arcs.ts';

const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tip = byId('tip');

// A closed box beats the faint shell around it; then the deeper node; then the nearer hit.
function priority(n: TreeNode) {
  let depth = 0;
  for (let p = n.parent; p; p = p.parent) depth++;
  return view.roles[n.id] === 'closed' ? depth + 10 : depth;
}
function pick(ev: MouseEvent): TreeNode | null {
  pointer.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(pointer, camera);
  const owner = new Map<THREE.Object3D, TreeNode>();
  for (const n of Object.values(view.T)) {
    if (n.gfx && n.kind !== 'group' && PICKABLE.has(view.roles[n.id])) owner.set(n.gfx.mesh, n);
  }
  const hits = ray
    .intersectObjects([...owner.keys()], false)
    .map((hit) => ({ node: owner.get(hit.object)!, distance: hit.distance }));
  hits.sort((a, b) => priority(b.node) - priority(a.node) || a.distance - b.distance);
  return hits[0]?.node ?? null;
}

function hint(n: TreeNode) {
  if (view.roles[n.id] === 'district') return t('clickFocus');
  if (ENTER.has(n.kind)) return t('clickOpen');
  return n.kind === 'file' ? `${n.file.loc} ${t('lines')} · ${n.file.hash}` : '';
}
function showTip(n: TreeNode, ev: MouseEvent) {
  const d = descOf(n);
  const summary = d ? L(d, 'biz') || L(d, 'tech') : '';
  const title = n.kind === 'module' ? modLabel(n.id) : n.name;
  tip.innerHTML = `<b>${esc(title)}</b>${summary ? `<span>${esc(summary)}</span>` : ''}<em>${hint(n)}</em>`;
  tip.hidden = false;
  tip.style.left = Math.min(ev.clientX + 14, innerWidth - 300) + 'px';
  tip.style.top = ev.clientY + 14 + 'px';
}

function hover(n: TreeNode | null, canvas: HTMLElement) {
  if (n === view.hovered) return;
  if (view.hovered) setGlow(view.hovered);
  view.hovered = n;
  if (n) setGlow(n, true);
  canvas.style.cursor = n ? 'pointer' : 'grab';
  drawArcs();
}

function click(n: TreeNode) {
  tip.hidden = true;
  if (state.flow) {
    const step = stepModules().indexOf(n.id);
    if (step >= 0) {
      state.step = step;
      applyState();
      return;
    }
    state.flow = ''; // clicking outside the flow leaves it
  }
  open(n);
}

export function wirePicking() {
  const canvas = renderer.domElement;
  canvas.addEventListener('pointermove', (ev) => {
    const n = pick(ev);
    hover(n, canvas);
    if (n) showTip(n, ev);
    else tip.hidden = true;
  });
  canvas.addEventListener('pointerleave', () => (tip.hidden = true));
  // A click is a press and release without dragging (dragging orbits the camera).
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (ev) => (down = { x: ev.clientX, y: ev.clientY }));
  canvas.addEventListener('pointerup', (ev) => {
    if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) return;
    const n = pick(ev);
    if (n) click(n);
  });
  canvas.addEventListener('dblclick', (ev) => {
    if (!pick(ev)) goUp();
  });
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLElement && e.target.closest('textarea, input, select')) return;
    if (e.key === 'Escape') goUp();
    if (state.flow && (e.key === 'ArrowRight' || e.key === 'ArrowLeft'))
      stepBy(e.key === 'ArrowRight' ? 1 : -1);
  });
}
