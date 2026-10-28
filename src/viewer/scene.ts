import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { isStale } from '../types.ts';
import { LEGACY_COLOR, REPO_COLOR, systemColor } from './data.ts';
import { byId } from './dom.ts';
import { state } from './state.ts';
import type { Gfx, Mark, TreeNode } from './tree.ts';
import { buildTree, view } from './tree.ts';
import { litSet, stepModules } from './roles.ts';

const dark = matchMedia('(prefers-color-scheme: dark)').matches;

export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
byId('stage').appendChild(renderer.domElement);
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
byId('labels').appendChild(labelRenderer.domElement);

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(40, 45, 55);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 2;
controls.maxDistance = 220;
controls.screenSpacePanning = false;

// Light intensities are physical (candela-like) since r155; ×π keeps the look of the old values.
scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x30302c : 0xd9d4c8, (dark ? 0.5 : 0.58) * Math.PI));
const sun = new THREE.DirectionalLight(0xffffff, (dark ? 0.7 : 0.62) * Math.PI);
sun.position.set(-30, 60, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 200 });
sun.shadow.bias = -0.0005;
scene.add(sun);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600),
  new THREE.ShadowMaterial({ opacity: dark ? 0.35 : 0.13 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(600, 300, dark ? 0x2c2b28 : 0xdcd8cf, dark ? 0x232220 : 0xe6e2da);
grid.position.y = -0.02;
scene.add(grid);

const unitBox = new THREE.BoxGeometry(1, 1, 1);
unitBox.translate(0, 0.5, 0);
const unitEdges = new THREE.EdgesGeometry(unitBox);
const unitDrum = new THREE.CylinderGeometry(0.5, 0.5, 1, 40);
unitDrum.translate(0, 0.5, 0);
const drumEdges = new THREE.EdgesGeometry(unitDrum, 30);
const staleDot = new THREE.SphereGeometry(0.16, 16, 12);
let world = new THREE.Group();
scene.add(world);

const lighten = (hex: number, k: number) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), k);
function colorFor(n: TreeNode) {
  if (n.kind === 'cap') return new THREE.Color(n.color);
  if (n.kind === 'root') return new THREE.Color(0x888888);
  if (n.kind === 'external') return new THREE.Color(systemColor(n.ref));
  const k = { group: 0.72, repo: 0.5, area: 0.35, module: 0.08, file: 0.45 }[n.kind];
  return lighten(REPO_COLOR[n.repo] ?? 0x888888, k);
}
const transparent = (color: number | THREE.Color, extra: object = {}) =>
  new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0, ...extra });

function makeLabel() {
  const el = document.createElement('div');
  el.className = 'lab';
  el.innerHTML = '<span class="n"></span>';
  const label = new CSS2DObject(el);
  label.visible = false;
  scene.add(label);
  return label;
}

function draw(n: TreeNode): Gfx {
  const shape = n.kind === 'external' ? unitDrum : unitBox;
  const mesh = new THREE.Mesh(shape, transparent(colorFor(n), { roughness: 0.75, metalness: 0.02 }));
  mesh.castShadow = n.kind !== 'group';
  mesh.receiveShadow = true;
  mesh.position.set(n.x, n.y, n.z);
  mesh.scale.set(n.w, 0.001, n.d);
  mesh.visible = false;
  mesh.userData.node = n;
  const edges = new THREE.LineSegments(
    n.kind === 'external' ? drumEdges : unitEdges,
    new THREE.LineBasicMaterial({ color: dark ? 0xdedad2 : 0x2a2824, transparent: true, opacity: 0 }),
  );
  mesh.add(edges);
  world.add(mesh);
  const gfx: Gfx = { mesh, edges };
  if (n.kind === 'module' && isStale(n.ref)) {
    gfx.staleMark = new THREE.Mesh(
      staleDot,
      new THREE.MeshBasicMaterial({ color: 0xf08a24, transparent: true, opacity: 0 }),
    );
    world.add(gfx.staleMark);
  }
  if (n.kind === 'module' && n.ref.legacy) {
    gfx.legacyMark = new THREE.Mesh(
      unitBox,
      transparent(LEGACY_COLOR[n.ref.legacy] ?? 0xb9b5ab, { roughness: 0.6 }),
    );
    world.add(gfx.legacyMark);
  }
  if (n.kind !== 'group') gfx.label = makeLabel();
  return gfx;
}

export function buildScene() {
  scene.remove(world);
  for (const n of Object.values(view.T)) {
    if (!n.gfx?.label) continue;
    scene.remove(n.gfx.label);
    n.gfx.label.element.remove();
  }
  world = new THREE.Group();
  scene.add(world);
  buildTree();
  for (const n of Object.values(view.T)) if (n.kind !== 'root') n.gfx = draw(n);
}

const EMISSIVE: Record<Mark, number> = { none: 0x000000, lit: 0x6a4200, flow: 0x000000, step: 0x7a1238 };
export const setGlow = (n: TreeNode, hovered = false) =>
  n.gfx?.mesh.material.emissive.setHex(hovered ? (dark ? 0x2a2a3a : 0x1d1d2a) : EMISSIVE[n.mark]);

let camGoal: THREE.Vector3 | null = null;
let targetGoal: THREE.Vector3 | null = null;
const VIEW_DIR = new THREE.Vector3(0.55, 0.85, 1).normalize();
function flyTo(target: THREE.Vector3, distance: number) {
  targetGoal = target;
  camGoal = target.clone().addScaledVector(VIEW_DIR, distance);
}
export function frameFocus() {
  const { T, root } = view;
  const lit = litSet();
  if (state.flow || lit.size) {
    const bounds = new THREE.Box3();
    for (const n of (state.flow ? stepModules() : [...lit]).map((id) => T[id]).filter(Boolean)) {
      bounds.expandByPoint(new THREE.Vector3(n.x - n.w / 2, n.y, n.z - n.d / 2));
      bounds.expandByPoint(new THREE.Vector3(n.x + n.w / 2, n.y + n.h, n.z + n.d / 2));
    }
    const size = bounds.getSize(new THREE.Vector3());
    flyTo(bounds.getCenter(new THREE.Vector3()), Math.max(size.x, size.z) * 1.15 + 6);
    return;
  }
  const n = T[state.focus] || root;
  const isRoot = n === root;
  const docked = isRoot
    ? []
    : root.children.filter((c) => c.kind === 'external' && view.roles[c.id] === 'closed');
  const reach = Math.max(0, ...docked.map((c) => 2 * Math.hypot(c.x - n.x, c.z - n.z) + c.w));
  const systems = root.children.some((c) => c.kind === 'external');
  const size = isRoot ? view.reach * (systems ? 2 : 1.6) : Math.max(n.w, n.d, n.h * 1.5, reach * 0.9);
  flyTo(new THREE.Vector3(n.x, n.y + (isRoot ? 0 : n.h * 0.35), n.z), size * (isRoot ? 1.2 : 1.55) + 3);
}
export function introCamera() {
  if (camGoal) camera.position.copy(camGoal).add(new THREE.Vector3(10, 18, 14));
}
controls.addEventListener('start', () => {
  camGoal = null;
  targetGoal = null;
});

export function fitView() {
  camera.aspect = innerWidth / innerHeight;
  if (innerWidth > 900 && state.panel)
    camera.setViewOffset(innerWidth, innerHeight, -225, 0, innerWidth, innerHeight);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
addEventListener('resize', () => {
  fitView();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

export const onFrame: ((t: number) => void)[] = [];

function ease(n: TreeNode, gfx: Gfx, k: number, t: number) {
  const { cur, tgt } = n;
  cur.fill += (tgt.fill - cur.fill) * k;
  cur.edge += (tgt.edge - cur.edge) * k;
  cur.sy += (tgt.sy - cur.sy) * k;
  const { mesh, edges, label, staleMark, legacyMark } = gfx;
  if (tgt.fill === 0 && cur.fill < 0.01 && cur.edge < 0.01) {
    for (const o of [mesh, staleMark, legacyMark, label]) if (o) o.visible = false;
    return;
  }
  const lift = (n === view.hovered ? 0.12 : 0) + (n.mark === 'step' ? 0.6 + Math.sin(t * 2.5) * 0.12 : 0);
  const top = n.y + lift + n.h * cur.sy;
  mesh.visible = true;
  mesh.position.x += (n.x - mesh.position.x) * k;
  mesh.position.z += (n.z - mesh.position.z) * k;
  mesh.position.y = n.y + lift;
  const { x, z } = mesh.position;
  mesh.scale.y = Math.max(0.001, n.h * cur.sy);
  mesh.material.opacity = cur.fill;
  mesh.material.depthWrite = cur.fill > 0.9;
  mesh.castShadow = cur.fill > 0.5 && n.kind !== 'group';
  edges.material.opacity = cur.edge;
  if (legacyMark) {
    legacyMark.visible = cur.fill > 0.5;
    legacyMark.material.opacity = cur.fill;
    legacyMark.position.set(x, top, z);
    legacyMark.scale.set(n.w * 0.98, 0.06, n.d * 0.98);
  }
  if (staleMark) {
    staleMark.visible = cur.fill > 0.5;
    staleMark.material.opacity = cur.fill;
    staleMark.scale.setScalar(Math.min(1, Math.max(n.w, 0.6)));
    staleMark.position.set(x + n.w / 2 - 0.15, top + 0.3 + Math.sin(t * 3) * 0.07, z - n.d / 2 + 0.15);
  }
  label?.position.set(x, top + 0.2, view.roles[n.id] === 'district' ? z - n.d / 2 : z);
}

/** Fraction of the way still to go after one second of easing toward a target. */
const LEFT_AFTER_ONE_SECOND = 0.0015;
let last = performance.now();
export function tick() {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  const t = now / 1000;
  last = now;
  const k = 1 - Math.pow(LEFT_AFTER_ONE_SECOND, dt);
  for (const n of Object.values(view.T)) if (n.gfx) ease(n, n.gfx, k, t);
  for (const hook of onFrame) hook(t);
  if (camGoal && targetGoal) {
    camera.position.lerp(camGoal, k * 0.9);
    controls.target.lerp(targetGoal, k * 0.9);
    if (camera.position.distanceTo(camGoal) < 0.05) camGoal = null;
  }
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(tick);
}
