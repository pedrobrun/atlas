// The nested boxes the scene draws. Every lens produces the same shape:
// root → containers → … → modules → files. 'group' nodes are plates that only organise
// space; clicking passes through them.
import type * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { FileEntry, PageData, SkNode } from '../types.ts';
import { CAP_COLOR, D, kids, modules, N, repoName, repoOf, short, SOURCES } from './data.ts';
import { L } from './i18n.ts';
import { state } from './state.ts';

export type Kind = 'root' | 'cap' | 'group' | 'repo' | 'area' | 'module' | 'file';
export interface Anim { fill: number; edge: number; sy: number }

export interface TreeNode {
  id: string;
  kind: Kind;
  name: string;
  children: TreeNode[];
  parent: TreeNode | null;
  ref?: SkNode;
  cap?: PageData['caps'][number];
  file?: FileEntry;
  repo?: string;
  color?: number;
  // layout: size, position relative to the parent, then absolute position
  w: number; d: number; h: number; stack: number;
  lx: number; lz: number;
  x: number; y: number; z: number;
  // render state, filled by scene.ts
  mesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  edges?: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  label?: CSS2DObject;
  staleMark?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  legacyMark?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  cur: Anim;
  tgt: Anim;
  inFlow: boolean;
  curStep: boolean;
  lit: boolean;
}

/** The current tree and its index; rebuilt when the lens or language changes. */
export const view = { T: {} as Record<string, TreeNode>, root: null as unknown as TreeNode };

export const ENTER = new Set<Kind>(['cap', 'repo', 'area', 'module']);

const mk = (p: Pick<TreeNode, 'id' | 'kind' | 'name'> & Partial<TreeNode>): TreeNode => ({
  children: [], parent: null, w: 0, d: 0, h: 0, stack: 0, lx: 0, lz: 0, x: 0, y: 0, z: 0,
  cur: { fill: 0, edge: 0, sy: 0.001 }, tgt: { fill: 0, edge: 0, sy: 0.001 }, inFlow: false, curStep: false, lit: false, ...p,
});

// Framework file names say nothing on their own (four route.ts side by side); prefix their folder.
const GENERIC = /^(route|page|layout|index|loading|react|types)\.(t|j)sx?$/;
const fileLabel = (p: string) => { const parts = p.split('/'), name = parts.pop()!; return GENERIC.test(name) ? `${parts.pop()}/${name}` : name; };

function moduleNode(m: SkNode): TreeNode {
  const repo = repoOf(m.id);
  return mk({ id: m.id, kind: 'module', name: m.name, ref: m, repo,
    children: m.files.map((f) => mk({ id: m.id + '#' + f.path, kind: 'file', name: fileLabel(f.path), file: f, repo })) });
}

export function buildTree(): TreeNode {
  const root = mk({ id: 'root', kind: 'root', name: D.config.name });
  if (state.lens === 'cap') {
    root.children = D.caps.map((c, i) => mk({ id: 'cap:' + c.id, kind: 'cap', name: L(c, 'name'), cap: c, color: CAP_COLOR[i % CAP_COLOR.length],
      children: SOURCES.map((s) => mk({ id: `grp:${c.id}:${s.id}`, kind: 'group', name: repoName[s.id], repo: s.id,
        children: modules.filter((m) => m.cap === c.id && repoOf(m.id) === s.id).map(moduleNode) })).filter((g) => g.children.length) }));
  } else {
    root.children = SOURCES.map((s) => mk({ id: 'repo:' + s.id, kind: 'repo', name: repoName[s.id], ref: N['repo:' + s.id], repo: s.id,
      children: (kids['repo:' + s.id] || []).map((a) => mk({ id: a, kind: 'area', name: short(N[a].name), ref: N[a], repo: s.id,
        children: (kids[a] || []).map((id) => moduleNode(N[id])) })) }));
  }
  view.T = {};
  (function walk(n: TreeNode, p: TreeNode | null) { n.parent = p; view.T[n.id] = n; n.children.forEach((c) => walk(c, n)); })(root, null);
  layout(root);
  place(root, 0, 0, 0);
  view.root = root;
  return root;
}

const GAP: Record<Kind, number> = { root: 2.4, cap: 0.6, group: 0.32, repo: 0.9, area: 0.4, module: 0.16, file: 0 };
const PAD: Record<Kind, number> = { root: 0, cap: 0.8, group: 0.3, repo: 0.8, area: 0.4, module: 0.22, file: 0 };

// Sizes bottom-up: a file's footprint and height grow with its lines; a container packs its
// children in rows and wraps them with padding, tall enough to enclose them.
function layout(n: TreeNode) {
  if (n.kind === 'file') {
    const l = n.file!.loc, s = Math.min(1.5, 0.32 + Math.sqrt(l) / 22);
    n.w = n.d = s; n.h = n.stack = 0.1 + Math.log10(l + 1) * 0.32;
    return;
  }
  n.children.forEach(layout);
  const items = [...n.children].sort((a, b) => b.w * b.d - a.w * a.d);
  const gap = GAP[n.kind];
  const area = items.reduce((s, it) => s + (it.w + gap) * (it.d + gap), 0);
  const rowW = Math.max(items[0]?.w || 1, Math.sqrt(area) * (n.kind === 'root' ? 1.5 : 1.2));
  let x = 0, z = 0, rowD = 0, maxW = 0;
  for (const it of items) {
    if (x > 0 && x + it.w > rowW) { z += rowD + gap; x = 0; rowD = 0; }
    it.lx = x + it.w / 2; it.lz = z + it.d / 2; x += it.w + gap; rowD = Math.max(rowD, it.d); maxW = Math.max(maxW, x - gap);
  }
  const W = maxW || 1, Dp = (z + rowD) || 1;
  items.forEach((it) => { it.lx -= W / 2; it.lz -= Dp / 2; });
  n.w = W + 2 * PAD[n.kind]; n.d = Dp + 2 * PAD[n.kind];
  const inner = Math.max(0, ...n.children.map((c) => c.stack));
  if (n.kind === 'group') { n.h = 0.07; n.stack = n.h + inner; }
  else if (n.kind === 'root') { n.h = 0; n.stack = inner; }
  else { n.h = inner + (n.kind === 'module' ? 0.3 : n.kind === 'area' ? 0.5 : 0.9 + Math.log10(1 + n.children.length) * 1.2); n.stack = n.h; }
}

function place(n: TreeNode, x: number, y: number, z: number) {
  n.x = x; n.y = y; n.z = z;
  const floor = y + (n.kind === 'group' ? n.h : n.kind === 'root' ? 0 : 0.02);
  n.children.forEach((c) => place(c, x + c.lx, floor, z + c.lz));
}

export const ancestors = (n: TreeNode) => { const a: TreeNode[] = []; for (let p = n.parent; p; p = p.parent) a.push(p); return a; };
export const modulesUnder = (n: TreeNode): string[] => (n.kind === 'module' ? [n.id] : n.children.flatMap(modulesUnder));
export const countLoc = (n: TreeNode): number => (n.kind === 'file' ? n.file!.loc : n.children.reduce((s, c) => s + countLoc(c), 0));
export const inside = (id: string, f: TreeNode) => { for (let n: TreeNode | null = view.T[id]; n; n = n.parent) if (n === f) return true; return false; };
