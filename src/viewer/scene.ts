// three.js: renderer, camera, lights, one mesh per tree node, and the frame loop that eases
// every node toward its role.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { LEGACY_COLOR, REPO_COLOR } from './data.ts';
import { state } from './state.ts';
import type { TreeNode } from './tree.ts';
import { buildTree, view } from './tree.ts';
import { litSet, stepModules } from './roles.ts';
import { animateArcs } from './arcs.ts';
import { applyState, nav } from './nav.ts';

const dark = matchMedia('(prefers-color-scheme: dark)').matches;

export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('stage')!.appendChild(renderer.domElement);
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
document.getElementById('labels')!.appendChild(labelRenderer.domElement);

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(40, 45, 55);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 2; controls.maxDistance = 220;
controls.screenSpacePanning = false;

// Light intensities are physical (candela-like) since r155; ×π keeps the look of the old values.
scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x30302c : 0xd9d4c8, (dark ? 0.5 : 0.58) * Math.PI));
const sun = new THREE.DirectionalLight(0xffffff, (dark ? 0.7 : 0.62) * Math.PI);
sun.position.set(-30, 60, 25); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 200 });
sun.shadow.bias = -0.0005;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShadowMaterial({ opacity: dark ? 0.35 : 0.13 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(600, 300, dark ? 0x2c2b28 : 0xdcd8cf, dark ? 0x232220 : 0xe6e2da);
grid.position.y = -0.02; scene.add(grid);

// Every box is a unit cube standing on its base, scaled to the node's size.
const unitBox = new THREE.BoxGeometry(1, 1, 1); unitBox.translate(0, 0.5, 0);
const unitEdges = new THREE.EdgesGeometry(unitBox);
const staleDot = new THREE.SphereGeometry(0.16, 16, 12);
let world = new THREE.Group(); scene.add(world);

const lighten = (hex: number, k: number) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), k);
function colorFor(n: TreeNode) {
  const c = REPO_COLOR[n.repo ?? ''] ?? 0x888888;
  switch (n.kind) {
    case 'cap': return new THREE.Color(n.color);
    case 'group': return lighten(c, 0.72);
    case 'repo': return lighten(c, 0.5);
    case 'area': return lighten(c, 0.35);
    case 'module': return lighten(c, 0.08);
    default: return lighten(c, 0.45);
  }
}
function makeLabel() {
  const el = document.createElement('div');
  el.className = 'lab';
  el.innerHTML = '<span class="n"></span>';
  const o = new CSS2DObject(el);
  o.visible = false;
  scene.add(o);
  return o;
}

/** (Re)builds the tree for the current lens and one mesh per node. */
export function buildScene() {
  scene.remove(world);
  for (const n of Object.values(view.T)) if (n.label) { scene.remove(n.label); n.label.element.remove(); }
  world = new THREE.Group(); scene.add(world);
  buildTree();
  for (const n of Object.values(view.T)) {
    if (n.kind === 'root') continue;
    const mesh = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: colorFor(n), roughness: 0.75, metalness: 0.02, transparent: true, opacity: 0 }));
    mesh.castShadow = n.kind !== 'group'; mesh.receiveShadow = true;
    mesh.position.set(n.x, n.y, n.z); mesh.scale.set(n.w, 0.001, n.d); mesh.visible = false;
    mesh.userData.node = n;
    const edges = new THREE.LineSegments(unitEdges, new THREE.LineBasicMaterial({ color: dark ? 0xdedad2 : 0x2a2824, transparent: true, opacity: 0 }));
    mesh.add(edges);
    world.add(mesh);
    n.mesh = mesh; n.edges = edges;
    if (n.kind === 'module' && n.ref?.stale) {
      n.staleMark = new THREE.Mesh(staleDot, new THREE.MeshBasicMaterial({ color: 0xf08a24, transparent: true, opacity: 0 }));
      world.add(n.staleMark);
    }
    if (n.kind === 'module' && n.ref?.legacy) {
      n.legacyMark = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: LEGACY_COLOR[n.ref.legacy] ?? 0xb9b5ab, transparent: true, opacity: 0, roughness: 0.6 }));
      world.add(n.legacyMark);
    }
    if (n.kind !== 'group') n.label = makeLabel();
  }
  applyState(true);
}

/** Highlight on top of a node's base color: current flow step, flow member, lit by the chat. */
export const baseEmissive = (n: TreeNode) => (n.curStep ? 0x7a1238 : n.inFlow ? 0x2e0614 : n.lit ? 0x6a4200 : 0x000000);
export const hoverEmissive = dark ? 0x2a2a3a : 0x1d1d2a;

// ---------- camera ----------
let camGoal: THREE.Vector3 | null = null, tgtGoal: THREE.Vector3 | null = null;
const VIEW_DIR = new THREE.Vector3(0.55, 0.85, 1).normalize();
function frameNode(n: TreeNode) {
  const { root } = view;
  const size = n === root ? Math.hypot(n.w, n.d) * 0.8 : Math.max(n.w, n.d, n.h * 1.5);
  const c = new THREE.Vector3(n.x, n.y + (n === root ? 0 : n.h * 0.35), n.z);
  tgtGoal = c; camGoal = c.clone().addScaledVector(VIEW_DIR, size * (n === root ? 1.2 : 1.55) + 3);
}
/** Flies to the focus, or to the bounding box of a flow or of the lit modules. */
export function frameFocus() {
  const { T, root } = view;
  const lit = litSet();
  if (state.flow || lit.size) {
    const box = new THREE.Box3();
    for (const n of (state.flow ? stepModules() : [...lit]).map((id) => T[id]).filter(Boolean)) {
      box.expandByPoint(new THREE.Vector3(n.x - n.w / 2, n.y, n.z - n.d / 2)).expandByPoint(new THREE.Vector3(n.x + n.w / 2, n.y + n.h, n.z + n.d / 2));
    }
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    tgtGoal = c; camGoal = c.clone().addScaledVector(VIEW_DIR, Math.max(sz.x, sz.z) * 1.15 + 6);
    return;
  }
  frameNode(T[state.focus] || root);
}
/** Starts the first flight from a little further out, so the map swoops in. */
export function introCamera() { if (camGoal) camera.position.copy(camGoal).add(new THREE.Vector3(10, 18, 14)); }
controls.addEventListener('start', () => { camGoal = null; tgtGoal = null; });

/** Keeps the scene centred in the space the side panel leaves. */
export function fitView() {
  camera.aspect = innerWidth / innerHeight;
  const off = innerWidth > 900 && state.panel ? -225 : 0;
  if (off) camera.setViewOffset(innerWidth, innerHeight, off, 0, innerWidth, innerHeight); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
addEventListener('resize', () => { fitView(); renderer.setSize(innerWidth, innerHeight); labelRenderer.setSize(innerWidth, innerHeight); });

// ---------- frame loop ----------
let last = performance.now();
export function tick() {
  const now = performance.now(), dt = Math.min((now - last) / 1000, 0.05), t = now / 1000;
  last = now;
  const k = 1 - Math.pow(0.0015, dt); // smooth approach, frame-rate independent
  for (const n of Object.values(view.T)) {
    if (!n.mesh || !n.edges) continue;
    const c = n.cur, g = n.tgt;
    c.fill += (g.fill - c.fill) * k; c.edge += (g.edge - c.edge) * k; c.sy += (g.sy - c.sy) * k;
    if (g.fill === 0 && c.fill < 0.01 && c.edge < 0.01) {
      n.mesh.visible = false;
      if (n.staleMark) n.staleMark.visible = false;
      if (n.legacyMark) n.legacyMark.visible = false;
      if (n.label) n.label.visible = false;
      continue;
    }
    n.mesh.visible = true;
    const lift = (n === nav.hovered ? 0.12 : 0) + (n.curStep ? 0.6 + Math.sin(t * 2.5) * 0.12 : 0);
    n.mesh.position.y = n.y + lift;
    n.mesh.scale.y = Math.max(0.001, n.h * c.sy);
    n.mesh.material.opacity = c.fill;
    n.mesh.material.depthWrite = c.fill > 0.9;
    n.mesh.castShadow = c.fill > 0.5 && n.kind !== 'group';
    n.edges.material.opacity = c.edge;
    const top = n.y + lift + n.h * c.sy;
    if (n.legacyMark) {
      n.legacyMark.visible = c.fill > 0.5; n.legacyMark.material.opacity = c.fill;
      n.legacyMark.position.set(n.x, top, n.z); n.legacyMark.scale.set(n.w * 0.98, 0.06, n.d * 0.98);
    }
    if (n.staleMark) {
      n.staleMark.visible = c.fill > 0.5; n.staleMark.material.opacity = c.fill;
      n.staleMark.scale.setScalar(Math.min(1, Math.max(n.w, 0.6)));
      n.staleMark.position.set(n.x + n.w / 2 - 0.15, top + 0.3 + Math.sin(t * 3) * 0.07, n.z - n.d / 2 + 0.15);
    }
    if (n.label) n.label.position.set(n.x, top + 0.2, nav.roles[n.id] === 'district' ? n.z - n.d / 2 : n.z);
  }
  animateArcs(t);
  if (camGoal && tgtGoal) {
    camera.position.lerp(camGoal, k * 0.9); controls.target.lerp(tgtGoal, k * 0.9);
    if (camera.position.distanceTo(camGoal) < 0.05) camGoal = null;
  }
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(tick);
}
