// The map build.ts embedded in the page, and lookups over it.
import type { Flow, MapNode, PageData } from '../types.ts';

export const D: PageData = JSON.parse(document.getElementById('atlas-data')!.textContent!);

export const N: Record<string, MapNode> = Object.fromEntries(D.nodes.map((n) => [n.id, n]));
export const kids: Record<string, string[]> = {};
for (const n of D.nodes) if (n.parent) (kids[n.parent] ??= []).push(n.id);
export const CAP = Object.fromEntries(D.caps.map((c) => [c.id, c]));
/** Includes drafts from the chat while they are previewed. */
export const FLOW: Record<string, Flow> = Object.fromEntries(D.flows.map((f) => [f.id, f]));
export const modules = D.nodes.filter((n) => n.kind === 'module');

export const repoOf = (id: string): string => {
  let n: MapNode | undefined = N[id];
  while (n && n.kind !== 'repo') n = n.parent ? N[n.parent] : undefined;
  return n ? n.id.split(':')[1] : '';
};
export const isUnder = (id: string, anc: string) => {
  for (let n: MapNode | undefined = N[id]; n; n = n.parent ? N[n.parent] : undefined)
    if (n.id === anc) return true;
  return false;
};
/** Drop an npm scope from package names. */
export const short = (s: string) => s.replace(/^@[^/]+\//, '');
export const modLabel = (id: string) => (N[id] ? `${short(N[N[id].parent!].name)} › ${N[id].name}` : id);

// Sources (repos) come from the project's config; colors fall back to a palette.
const PALETTE = [0x8b74ff, 0x3b9ae8, 0xe3a23b, 0x2fb57c, 0xe25d8a, 0x6c7a89];
export const SOURCES = D.config.sources;
export const repoName: Record<string, string> = Object.fromEntries(SOURCES.map((x) => [x.id, x.name]));
export const REPO_COLOR: Record<string, number> = Object.fromEntries(
  SOURCES.map((x, i) => [
    x.id,
    x.color ? parseInt(x.color.replace('#', ''), 16) : PALETTE[i % PALETTE.length],
  ]),
);
export const LEGACY_COLOR: Record<string, number> = {
  extracted: 0x8b74ff,
  duplicate: 0xe25555,
  candidate: 0xe3a23b,
  local: 0xb9b5ab,
};
export const CAP_COLOR = [
  0xc9b8f2, 0x9fd3e6, 0xf2b8a8, 0xa9d9a4, 0xf3cf86, 0xb7c3f0, 0xe6b3d6, 0x9fdccb, 0xd8cfbf,
];
export const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
