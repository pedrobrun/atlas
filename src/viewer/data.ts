import type { Flow, MapNode, PageData } from '../types.ts';

export const D: PageData = JSON.parse(document.getElementById('atlas-data')!.textContent!);

export const N: Record<string, MapNode> = Object.fromEntries(D.nodes.map((n) => [n.id, n]));
export const kids: Record<string, string[]> = {};
for (const n of D.nodes) if (n.parent) (kids[n.parent] ??= []).push(n.id);
export const CAP = Object.fromEntries(D.caps.map((c) => [c.id, c]));
export const FLOW: Record<string, Flow> = Object.fromEntries(D.flows.map((f) => [f.id, f]));
export const addDraftFlow = (flow: Flow) => {
  FLOW[flow.id] = flow;
};
export const modules = D.nodes.filter((n) => n.kind === 'module');
export const externals = D.nodes.filter((n) => n.kind === 'external');

export const repoOf = (id: string): string => {
  let n: MapNode | undefined = N[id];
  while (n && n.kind !== 'repo') n = n.parent ? N[n.parent] : undefined;
  return n ? n.id.split(':')[1] : '';
};
export const short = (s: string) => s.replace(/^@[^/]+\//, '');
export function modLabel(id: string) {
  const n = N[id];
  const parent = n?.parent ? N[n.parent] : undefined;
  return n ? (parent ? `${short(parent.name)} › ${n.name}` : n.name) : id;
}

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
const SYSTEM_PALETTE = [0xd9822b, 0x3d8fb8, 0x8a6bd1, 0x2f9e7a, 0xc75b7a, 0x9b8a4a];
const systemKinds = [...new Set(externals.map((e) => e.system ?? ''))];
export const systemColor = (n: MapNode) =>
  SYSTEM_PALETTE[systemKinds.indexOf(n.system ?? '') % SYSTEM_PALETTE.length];
export const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
