// Deterministic skeleton of a project: sources (repos) → areas → modules, import edges,
// content hashes. No LLM. Everything project-specific comes from <project>/.atlas/atlas.config.json.
// Usage: node skeleton.mjs <project>   → writes <project>/.atlas/out/skeleton.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const PROJECT = path.resolve(process.argv[2] || '.');
const config = JSON.parse(fs.readFileSync(path.join(PROJECT, '.atlas/atlas.config.json'), 'utf8'));
const OUT = path.join(PROJECT, '.atlas/out');
fs.mkdirSync(OUT, { recursive: true });

const CODE = /\.(ts|tsx|js|jsx|mjs)$/;
const SKIP = /\.(test|spec|dbtest)\.[jt]sx?$|(^|\/)(e2e|node_modules|dist)\//;
const EXT = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js'];
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
const fill = (tpl, m) => tpl.replace(/\$(\d)/g, (_, i) => m[+i] ?? '');

// A source's `modules` rules say how a file path becomes an area and a module; first match wins.
const sources = config.sources.map((s) => ({ ...s, rules: s.modules.map((r) => ({ ...r, re: new RegExp(r.match) })) }));
function locate(src, file) {
  for (const r of src.rules) {
    const m = file.match(r.re);
    if (m) return { area: fill(r.area, m), areaName: r.areaName ? fill(r.areaName, m) : null, module: fill(r.module, m) };
  }
  return null;
}

const files = {};   // source id → Set of tracked code files
for (const src of sources) {
  const cwd = path.join(PROJECT, src.dir);
  files[src.id] = new Set(execSync('git ls-files', { cwd }).toString().split('\n').filter((f) => CODE.test(f) && !SKIP.test(f)));
}

// Package names and their `exports` turn bare specifiers into files, across sources.
const exportsMap = {};
for (const src of sources) {
  const cwd = path.join(PROJECT, src.dir);
  for (const pj of execSync('git ls-files "*package.json"', { cwd }).toString().split('\n').filter((f) => f && !f.includes('node_modules'))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, pj), 'utf8'));
    if (!pkg.name) continue;
    const dir = path.dirname(pj) === '.' ? '' : path.dirname(pj) + '/';
    const exp = typeof pkg.exports === 'string' ? { '.': pkg.exports } : pkg.exports || { '.': pkg.main || './index.ts' };
    for (const [sub, target] of Object.entries(exp)) {
      const t = typeof target === 'string' ? target : target?.import || target?.default;
      if (t) exportsMap[pkg.name + sub.slice(1)] = { src: src.id, file: path.normalize(dir + t) };
    }
  }
}
const existing = (srcId, p) => { for (const e of EXT) if (files[srcId].has(p + e)) return p + e; return null; };
function resolve(src, file, spec) {
  if (exportsMap[spec]) return exportsMap[spec];
  if (spec.startsWith('.')) { const f = existing(src.id, path.normalize(path.join(path.dirname(file), spec))); return f && { src: src.id, file: f }; }
  for (const [alias, to] of Object.entries(src.aliases || {})) {
    if (spec.startsWith(alias)) { const f = existing(src.id, path.normalize(to + spec.slice(alias.length))); return f && { src: src.id, file: f }; }
  }
  return null;
}

const nodes = {}, edges = {};
const node = (id, props) => (nodes[id] ??= { id, files: [], loc: 0, ...props });
const moduleOf = (srcId, file) => { const src = sources.find((s) => s.id === srcId); const l = locate(src, file); return l && `${srcId}/${l.area}/${l.module}`; };

for (const src of sources) {
  const cwd = path.join(PROJECT, src.dir);
  node(`repo:${src.id}`, { kind: 'repo', name: src.name || src.dir, role: src.role || null,
    sha: execSync('git rev-parse --short HEAD', { cwd }).toString().trim(), branch: execSync('git rev-parse --abbrev-ref HEAD', { cwd }).toString().trim() });
  for (const f of files[src.id]) {
    const l = locate(src, f);
    if (!l) continue;
    const areaId = `${src.id}/${l.area}`, modId = `${areaId}/${l.module}`;
    node(areaId, { kind: 'area', name: l.areaName || l.area, parent: `repo:${src.id}` });
    const n = node(modId, { kind: 'module', name: l.module, parent: areaId });
    const text = fs.readFileSync(path.join(cwd, f), 'utf8');
    const loc = text.split('\n').length;
    n.files.push({ path: `${src.dir}/${f}`, hash: sha(text), loc });
    n.loc += loc; nodes[areaId].loc += loc;
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const hit = resolve(src, f, m[1]);
      const to = hit && moduleOf(hit.src, hit.file);
      if (!to || to === modId) continue;
      const k = `${modId}|${to}|${hit.src === src.id ? 'uses' : 'consumes'}`;
      edges[k] = (edges[k] || 0) + 1;
    }
  }
}

const edgeList = Object.entries(edges).map(([k, w]) => { const [from, to, kind] = k.split('|'); return { from, to, kind, w }; }).filter((e) => nodes[e.from] && nodes[e.to]);
fs.writeFileSync(path.join(OUT, 'skeleton.json'), JSON.stringify({ generatedAt: new Date().toISOString(), nodes: Object.values(nodes), edges: edgeList }, null, 1));
console.error(`skeleton: ${Object.values(nodes).filter((n) => n.kind === 'module').length} modules, ${edgeList.length} edges → ${path.relative(PROJECT, OUT)}/skeleton.json`);
