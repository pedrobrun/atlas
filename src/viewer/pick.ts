// Hover and click on boxes in the scene.
import * as THREE from 'three';
import { esc, modLabel } from './data.ts';
import { t } from './i18n.ts';
import { state } from './state.ts';
import type { TreeNode } from './tree.ts';
import { ENTER, view } from './tree.ts';
import { PICKABLE, stepModules } from './roles.ts';
import { applyState, goUp, nav, open, stepBy } from './nav.ts';
import { baseEmissive, camera, hoverEmissive, renderer } from './scene.ts';
import { drawArcs } from './arcs.ts';
import { summary } from './panels.ts';

const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
const tip = document.getElementById('tip')!;

// A closed box beats the faint shell around it; then the deeper node; then the nearer hit.
const depth = (n: TreeNode) => { let d = 0; for (let p = n.parent; p; p = p.parent) d++; return nav.roles[n.id] === 'closed' ? d + 10 : d; };
function pick(ev: PointerEvent | MouseEvent): TreeNode | null {
  ptr.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const cands = Object.values(view.T).filter((n) => n.mesh && n.kind !== 'group' && PICKABLE.has(nav.roles[n.id])).map((n) => n.mesh!);
  const hits = ray.intersectObjects(cands, false);
  const node = (o: THREE.Object3D) => o.userData.node as TreeNode;
  hits.sort((a, b) => depth(node(b.object)) - depth(node(a.object)) || a.distance - b.distance);
  return hits[0] ? node(hits[0].object) : null;
}

export function wirePicking() {
  const el = renderer.domElement;
  el.addEventListener('pointermove', (ev) => {
    const n = pick(ev);
    if (n !== nav.hovered) {
      if (nav.hovered?.mesh) nav.hovered.mesh.material.emissive.setHex(baseEmissive(nav.hovered));
      nav.hovered = n;
      n?.mesh?.material.emissive.setHex(hoverEmissive);
      el.style.cursor = n ? 'pointer' : 'grab';
      drawArcs();
    }
    if (!n) { tip.hidden = true; return; }
    const d = summary(n);
    const hint = nav.roles[n.id] === 'district' ? t('clickFocus') : ENTER.has(n.kind) ? t('clickOpen') : n.kind === 'file' ? `${n.file!.loc} ${t('lines')} · ${n.file!.hash}` : '';
    tip.innerHTML = `<b>${esc(n.kind === 'module' ? modLabel(n.id) : n.name)}</b>${d ? `<span>${esc(d)}</span>` : ''}<em>${hint}</em>`;
    tip.hidden = false;
    tip.style.left = Math.min(ev.clientX + 14, innerWidth - 300) + 'px';
    tip.style.top = ev.clientY + 14 + 'px';
  });
  el.addEventListener('pointerleave', () => { tip.hidden = true; });
  // A click is a press and release without dragging (dragging orbits the camera).
  let down: { x: number; y: number } | null = null;
  el.addEventListener('pointerdown', (ev) => { down = { x: ev.clientX, y: ev.clientY }; });
  el.addEventListener('pointerup', (ev) => {
    if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) return;
    const n = pick(ev);
    if (!n) return;
    tip.hidden = true;
    if (state.flow) {
      const i = stepModules().indexOf(n.id);
      if (i >= 0) { state.step = i; applyState(); return; }
      state.flow = ''; // clicking outside the flow leaves it
    }
    open(n);
  });
  el.addEventListener('dblclick', (ev) => { if (!pick(ev)) goUp(); });
  addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest?.('textarea, input, select')) return;
    if (e.key === 'Escape') goUp();
    if (state.flow && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) stepBy(e.key === 'ArrowRight' ? 1 : -1);
  });
}
