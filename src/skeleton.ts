// Deterministic skeleton of a project: sources (repos) → areas → modules, import edges,
// content hashes. No LLM. Everything project-specific comes from <project>/.atlas/atlas.config.json.
// Usage: node src/skeleton.ts <project>   → writes <project>/.atlas/out/skeleton.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import type { AtlasConfig, Edge, SkNode, SourceConfig } from './types.ts';

const PROJECT = path.resolve(process.argv[2] || '.');
const config: AtlasConfig = JSON.parse(
  fs.readFileSync(path.join(PROJECT, '.atlas/atlas.config.json'), 'utf8'),
);
const OUT = path.join(PROJECT, '.atlas/out');
fs.mkdirSync(OUT, { recursive: true });

const CODE = /\.(ts|tsx|js|jsx|mjs)$/;
const SKIP = /\.(test|spec|dbtest)\.[jt]sx?$|(^|\/)(e2e|node_modules|dist)\//;
const EXT = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js'];
const sha = (s: string) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
const fill = (tpl: string, m: RegExpMatchArray) => tpl.replace(/\$(\d)/g, (_, i: string) => m[+i] ?? '');
const git = (cwd: string, cmd: string) => execSync(`git ${cmd}`, { cwd }).toString();

interface Source extends SourceConfig {
  rules: { re: RegExp; area: string; areaName?: string; module: string }[];
}
interface Location {
  area: string;
  areaName: string | null;
  module: string;
}

// A source's `modules` rules say how a file path becomes an area and a module; first match wins.
const sources: Source[] = config.sources.map((s) => ({
  ...s,
  rules: s.modules.map((r) => ({ ...r, re: new RegExp(r.match) })),
}));
function locate(src: Source, file: string): Location | null {
  for (const r of src.rules) {
    const m = file.match(r.re);
    if (m)
      return {
        area: fill(r.area, m),
        areaName: r.areaName ? fill(r.areaName, m) : null,
        module: fill(r.module, m),
      };
  }
  return null;
}

const files: Record<string, Set<string>> = {};
for (const src of sources) {
  files[src.id] = new Set(
    git(path.join(PROJECT, src.dir), 'ls-files')
      .split('\n')
      .filter((f) => CODE.test(f) && !SKIP.test(f)),
  );
}

// Package names and their `exports` turn bare specifiers into files, across sources.
interface Target {
  src: string;
  file: string;
}
const exportsMap: Record<string, Target> = {};
for (const src of sources) {
  const cwd = path.join(PROJECT, src.dir);
  for (const pj of git(cwd, 'ls-files "*package.json"')
    .split('\n')
    .filter((f) => f && !f.includes('node_modules'))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, pj), 'utf8'));
    if (!pkg.name) continue;
    const dir = path.dirname(pj) === '.' ? '' : path.dirname(pj) + '/';
    const exp: Record<string, unknown> =
      typeof pkg.exports === 'string'
        ? { '.': pkg.exports }
        : pkg.exports || { '.': pkg.main || './index.ts' };
    for (const [sub, target] of Object.entries(exp)) {
      const t =
        typeof target === 'string'
          ? target
          : ((target as { import?: string; default?: string } | null)?.import ??
            (target as { default?: string } | null)?.default);
      if (t) exportsMap[pkg.name + sub.slice(1)] = { src: src.id, file: path.normalize(dir + t) };
    }
  }
}
const existing = (srcId: string, p: string) => EXT.map((e) => p + e).find((f) => files[srcId].has(f)) ?? null;
function resolve(src: Source, file: string, spec: string): Target | null {
  if (exportsMap[spec]) return exportsMap[spec];
  const within = (p: string) => {
    const f = existing(src.id, path.normalize(p));
    return f ? { src: src.id, file: f } : null;
  };
  if (spec.startsWith('.')) return within(path.join(path.dirname(file), spec));
  for (const [alias, to] of Object.entries(src.aliases || {}))
    if (spec.startsWith(alias)) return within(to + spec.slice(alias.length));
  return null;
}

const nodes: Record<string, SkNode> = {};
const edges: Record<string, number> = {};
const node = (id: string, props: Omit<SkNode, 'id' | 'files' | 'loc'>) =>
  (nodes[id] ??= { id, files: [], loc: 0, ...props });
const moduleOf = (t: Target) => {
  const src = sources.find((s) => s.id === t.src)!;
  const l = locate(src, t.file);
  return l && `${t.src}/${l.area}/${l.module}`;
};

for (const src of sources) {
  const cwd = path.join(PROJECT, src.dir);
  node(`repo:${src.id}`, {
    kind: 'repo',
    name: src.name || src.dir,
    role: src.role || null,
    sha: git(cwd, 'rev-parse --short HEAD').trim(),
    branch: git(cwd, 'rev-parse --abbrev-ref HEAD').trim(),
  });
  for (const f of files[src.id]) {
    const l = locate(src, f);
    if (!l) continue;
    const areaId = `${src.id}/${l.area}`,
      modId = `${areaId}/${l.module}`;
    node(areaId, { kind: 'area', name: l.areaName || l.area, parent: `repo:${src.id}` });
    const n = node(modId, { kind: 'module', name: l.module, parent: areaId });
    const text = fs.readFileSync(path.join(cwd, f), 'utf8');
    const loc = text.split('\n').length;
    n.files.push({ path: `${src.dir}/${f}`, hash: sha(text), loc });
    n.loc += loc;
    nodes[areaId].loc += loc;
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const hit = resolve(src, f, m[1]);
      const to = hit && moduleOf(hit);
      if (!hit || !to || to === modId) continue;
      const k = `${modId}|${to}|${hit.src === src.id ? 'uses' : 'consumes'}`;
      edges[k] = (edges[k] || 0) + 1;
    }
  }
}

const edgeList: Edge[] = Object.entries(edges)
  .map(([k, w]) => {
    const [from, to, kind] = k.split('|');
    return { from, to, kind: kind as Edge['kind'], w };
  })
  .filter((e) => nodes[e.from] && nodes[e.to]);
fs.writeFileSync(
  path.join(OUT, 'skeleton.json'),
  JSON.stringify(
    { generatedAt: new Date().toISOString(), nodes: Object.values(nodes), edges: edgeList },
    null,
    1,
  ),
);
console.error(
  `skeleton: ${Object.values(nodes).filter((n) => n.kind === 'module').length} modules, ${edgeList.length} edges → ${path.relative(PROJECT, OUT)}/skeleton.json`,
);
