import type * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { FileEntry, MapNode, PageData } from '../types.ts';
import { CAP_COLOR, D, kids, modules, N, repoName, repoOf, short, SOURCES } from './data.ts';
import { L } from './i18n.ts';
import type { Role } from './roles.ts';
import { state } from './state.ts';

export interface Anim {
  fill: number;
  edge: number;
  sy: number;
}

export type Mark = 'none' | 'lit' | 'flow' | 'step';

export interface Gfx {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  label?: CSS2DObject;
  staleMark?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  legacyMark?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
}

interface Box {
  id: string;
  name: string;
  children: TreeNode[];
  parent: TreeNode | null;
  w: number;
  d: number;
  h: number;
  stack: number;
  lx: number;
  lz: number;
  x: number;
  y: number;
  z: number;
  cur: Anim;
  tgt: Anim;
  mark: Mark;
  gfx?: Gfx;
}

export type TreeNode = Box &
  (
    | { kind: 'root' }
    | { kind: 'cap'; cap: PageData['caps'][number]; color: number }
    | { kind: 'group'; repo: string }
    | { kind: 'repo' | 'area' | 'module'; repo: string; ref: MapNode }
    | { kind: 'file'; repo: string; file: FileEntry }
  );
export type Kind = TreeNode['kind'];
export type RootNode = Extract<TreeNode, { kind: 'root' }>;

interface View {
  root: RootNode;
  T: Record<string, TreeNode>;
  roles: Record<string, Role>;
  hovered: TreeNode | null;
}

export const ENTER = new Set<Kind>(['cap', 'repo', 'area', 'module']);

type Variant = TreeNode extends infer T
  ? T extends TreeNode
    ? Omit<T, Exclude<keyof Box, 'id' | 'name'>>
    : never
  : never;
function box<V extends Variant>(variant: V, children: TreeNode[] = []): V & Box {
  const shared: Box = {
    ...{ id: variant.id, name: variant.name, children, parent: null },
    ...{ w: 0, d: 0, h: 0, stack: 0, lx: 0, lz: 0, x: 0, y: 0, z: 0 },
    ...{ cur: { fill: 0, edge: 0, sy: 0.001 }, tgt: { fill: 0, edge: 0, sy: 0.001 }, mark: 'none' },
  };
  return { ...variant, ...shared };
}

export const view: View = {
  root: box({ kind: 'root', id: 'root', name: D.config.name }),
  T: {},
  roles: {},
  hovered: null,
};

const GENERIC = /^(route|page|layout|index|loading|react|types)\.(t|j)sx?$/;
function fileLabel(path: string) {
  const parts = path.split('/');
  const name = parts.pop()!;
  return GENERIC.test(name) ? `${parts.pop()}/${name}` : name;
}

function moduleBox(m: MapNode) {
  const repo = repoOf(m.id);
  const files = m.files.map((f) =>
    box({ kind: 'file', id: `${m.id}#${f.path}`, name: fileLabel(f.path), repo, file: f }),
  );
  return box({ kind: 'module', id: m.id, name: m.name, repo, ref: m }, files);
}

function capabilityLens() {
  return D.caps.map((c, i) => {
    const groups = SOURCES.map((s) => {
      const members = modules.filter((m) => m.cap === c.id && repoOf(m.id) === s.id).map(moduleBox);
      return box({ kind: 'group', id: `grp:${c.id}:${s.id}`, name: repoName[s.id], repo: s.id }, members);
    }).filter((g) => g.children.length);
    return box(
      { kind: 'cap', id: 'cap:' + c.id, name: L(c, 'name'), cap: c, color: CAP_COLOR[i % CAP_COLOR.length] },
      groups,
    );
  });
}

function repoLens() {
  return SOURCES.map((s) => {
    const id = 'repo:' + s.id;
    const areas = (kids[id] || []).map((a) => {
      const members = (kids[a] || []).map((m) => moduleBox(N[m]));
      return box({ kind: 'area', id: a, name: short(N[a].name), repo: s.id, ref: N[a] }, members);
    });
    return box({ kind: 'repo', id, name: repoName[s.id], repo: s.id, ref: N[id] }, areas);
  });
}

export function buildTree() {
  const root = box(
    { kind: 'root', id: 'root', name: D.config.name },
    state.lens === 'cap' ? capabilityLens() : repoLens(),
  );
  view.T = {};
  (function index(n: TreeNode, parent: TreeNode | null) {
    n.parent = parent;
    view.T[n.id] = n;
    n.children.forEach((c) => index(c, n));
  })(root, null);
  layout(root);
  place(root, 0, 0, 0);
  view.root = root;
}

const GAP: Record<Kind, number> = {
  root: 2.4,
  cap: 0.6,
  group: 0.32,
  repo: 0.9,
  area: 0.4,
  module: 0.16,
  file: 0,
};
const PAD: Record<Kind, number> = {
  root: 0,
  cap: 0.8,
  group: 0.3,
  repo: 0.8,
  area: 0.4,
  module: 0.22,
  file: 0,
};
const HEADROOM = (n: TreeNode) =>
  n.kind === 'module' ? 0.3 : n.kind === 'area' ? 0.5 : 0.9 + Math.log10(1 + n.children.length) * 1.2;

function layout(n: TreeNode) {
  if (n.kind === 'file') {
    const lines = n.file.loc;
    n.w = n.d = Math.min(1.5, 0.32 + Math.sqrt(lines) / 22);
    n.h = n.stack = 0.1 + Math.log10(lines + 1) * 0.32;
    return;
  }
  n.children.forEach(layout);
  const items = [...n.children].sort((a, b) => b.w * b.d - a.w * a.d);
  const gap = GAP[n.kind];
  const area = items.reduce((sum, it) => sum + (it.w + gap) * (it.d + gap), 0);
  const rowWidth = Math.max(items[0]?.w || 1, Math.sqrt(area) * (n.kind === 'root' ? 1.5 : 1.2));
  let x = 0;
  let z = 0;
  let rowDepth = 0;
  let width = 0;
  for (const it of items) {
    if (x > 0 && x + it.w > rowWidth) {
      z += rowDepth + gap;
      x = 0;
      rowDepth = 0;
    }
    it.lx = x + it.w / 2;
    it.lz = z + it.d / 2;
    x += it.w + gap;
    rowDepth = Math.max(rowDepth, it.d);
    width = Math.max(width, x - gap);
  }
  const w = width || 1;
  const d = z + rowDepth || 1;
  for (const it of items) {
    it.lx -= w / 2;
    it.lz -= d / 2;
  }
  n.w = w + 2 * PAD[n.kind];
  n.d = d + 2 * PAD[n.kind];
  const inner = Math.max(0, ...n.children.map((c) => c.stack));
  if (n.kind === 'group') {
    n.h = 0.07;
    n.stack = n.h + inner;
  } else if (n.kind === 'root') {
    n.h = 0;
    n.stack = inner;
  } else {
    n.h = n.stack = inner + HEADROOM(n);
  }
}

function place(n: TreeNode, x: number, y: number, z: number) {
  n.x = x;
  n.y = y;
  n.z = z;
  const floor = y + (n.kind === 'group' ? n.h : n.kind === 'root' ? 0 : 0.02);
  n.children.forEach((c) => place(c, x + c.lx, floor, z + c.lz));
}

export function ancestors(n: TreeNode) {
  const up: TreeNode[] = [];
  for (let p = n.parent; p; p = p.parent) up.push(p);
  return up;
}
export const modulesUnder = (n: TreeNode): string[] =>
  n.kind === 'module' ? [n.id] : n.children.flatMap(modulesUnder);
export const countLoc = (n: TreeNode): number =>
  n.kind === 'file' ? n.file.loc : n.children.reduce((sum, c) => sum + countLoc(c), 0);
export function inside(id: string, container: TreeNode) {
  for (let n: TreeNode | null = view.T[id]; n; n = n.parent) if (n === container) return true;
  return false;
}
export const descOf = (n: TreeNode) =>
  n.kind === 'cap'
    ? n.cap
    : n.kind === 'file'
      ? n.file.desc
      : n.kind === 'root' || n.kind === 'group'
        ? undefined
        : n.ref.desc;
