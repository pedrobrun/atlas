import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { Edge, SkNode, SourceConfig } from './types.ts';
import { parseConfig } from './parse.ts';
import { atlasPaths, readJson, sha8 } from './project.ts';

const CODE = /\.(ts|tsx|js|jsx|mjs)$/;
const SKIP = /\.(test|spec|dbtest)\.[jt]sx?$|(^|\/)(e2e|node_modules|dist)\//;
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js'];
const IMPORT = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

const project = path.resolve(process.argv[2] || '.');
const paths = atlasPaths(project);
const config = parseConfig(readJson(paths.config));
const git = (cwd: string, cmd: string) => execSync(`git ${cmd}`, { cwd }).toString();
const lines = (text: string) => text.split('\n').filter(Boolean);

interface Source extends SourceConfig {
  cwd: string;
  files: Set<string>;
  rules: { re: RegExp; area: string; areaName?: string; module: string }[];
}
interface Target {
  source: Source;
  file: string;
}

const sources = new Map<string, Source>(
  config.sources.map((s) => {
    const cwd = path.join(project, s.dir);
    const files = new Set(lines(git(cwd, 'ls-files')).filter((f) => CODE.test(f) && !SKIP.test(f)));
    const rules = s.modules.map((r) => ({ ...r, re: new RegExp(r.match) }));
    return [s.id, { ...s, cwd, files, rules }];
  }),
);

function locate(source: Source, file: string) {
  const fill = (template: string, m: RegExpMatchArray) =>
    template.replace(/\$(\d)/g, (_, i: string) => m[+i] ?? '');
  for (const r of source.rules) {
    const m = file.match(r.re);
    if (!m) continue;
    const area = fill(r.area, m);
    return { area, areaName: r.areaName ? fill(r.areaName, m) : area, module: fill(r.module, m) };
  }
  return null;
}
const moduleId = (t: Target) => {
  const l = locate(t.source, t.file);
  return l && `${t.source.id}/${l.area}/${l.module}`;
};

function exportTarget(entry: unknown): string | null {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    const fields: Record<string, unknown> = { ...entry };
    const { import: imp, default: def } = fields;
    if (typeof imp === 'string') return imp;
    if (typeof def === 'string') return def;
  }
  return null;
}

const packageExports = new Map<string, Target>();
for (const source of sources.values()) {
  for (const manifest of lines(git(source.cwd, 'ls-files "*package.json"'))) {
    if (manifest.includes('node_modules')) continue;
    const pkg = readJson(path.join(source.cwd, manifest));
    if (!pkg || typeof pkg !== 'object') continue;
    const fields: Record<string, unknown> = { ...pkg };
    const { name, exports: declared, main } = fields;
    if (typeof name !== 'string') continue;
    const dir = path.dirname(manifest) === '.' ? '' : path.dirname(manifest) + '/';
    const exports =
      typeof declared === 'string' ? { '.': declared } : declared || { '.': main || './index.ts' };
    for (const [subpath, entry] of Object.entries(exports)) {
      const file = exportTarget(entry);
      if (file) packageExports.set(name + subpath.slice(1), { source, file: path.normalize(dir + file) });
    }
  }
}

function resolveImport(source: Source, file: string, spec: string): Target | null {
  const exported = packageExports.get(spec);
  if (exported) return exported;
  const within = (p: string): Target | null => {
    const base = path.normalize(p);
    const hit = EXTENSIONS.map((e) => base + e).find((f) => source.files.has(f));
    return hit ? { source, file: hit } : null;
  };
  if (spec.startsWith('.')) return within(path.join(path.dirname(file), spec));
  for (const [alias, to] of Object.entries(source.aliases ?? {})) {
    if (spec.startsWith(alias)) return within(to + spec.slice(alias.length));
  }
  return null;
}

const nodes = new Map<string, SkNode>();
const edges = new Map<string, Edge>();
const node = (id: string, props: Omit<SkNode, 'id' | 'files' | 'loc'>) => {
  const existing = nodes.get(id);
  if (existing) return existing;
  const created: SkNode = { id, files: [], loc: 0, ...props };
  nodes.set(id, created);
  return created;
};
function addEdge(from: string, to: string, kind: Edge['kind']) {
  const key = `${from}|${to}|${kind}`;
  const edge = edges.get(key);
  if (edge) edge.w++;
  else edges.set(key, { from, to, kind, w: 1 });
}

for (const source of sources.values()) {
  node(`repo:${source.id}`, {
    kind: 'repo',
    name: source.name || source.dir,
    role: source.role || null,
    sha: git(source.cwd, 'rev-parse --short HEAD').trim(),
    branch: git(source.cwd, 'rev-parse --abbrev-ref HEAD').trim(),
  });
  for (const file of source.files) {
    const l = locate(source, file);
    if (!l) continue;
    const areaId = `${source.id}/${l.area}`;
    const modId = `${areaId}/${l.module}`;
    const area = node(areaId, { kind: 'area', name: l.areaName, parent: `repo:${source.id}` });
    const mod = node(modId, { kind: 'module', name: l.module, parent: areaId });
    const text = fs.readFileSync(path.join(source.cwd, file), 'utf8');
    const loc = text.split('\n').length;
    mod.files.push({ path: `${source.dir}/${file}`, hash: sha8(text), loc });
    mod.loc += loc;
    area.loc += loc;
    for (const [, spec] of text.matchAll(IMPORT)) {
      const target = resolveImport(source, file, spec);
      const to = target && moduleId(target);
      if (target && to && to !== modId) addEdge(modId, to, target.source === source ? 'uses' : 'consumes');
    }
  }
}

const edgeList = [...edges.values()].filter((e) => nodes.has(e.from) && nodes.has(e.to));
const moduleCount = [...nodes.values()].filter((n) => n.kind === 'module').length;
fs.mkdirSync(paths.out, { recursive: true });
fs.writeFileSync(
  paths.skeleton,
  JSON.stringify(
    { generatedAt: new Date().toISOString(), nodes: [...nodes.values()], edges: edgeList },
    null,
    1,
  ),
);
console.error(
  `skeleton: ${moduleCount} modules, ${edgeList.length} edges → ${path.relative(project, paths.skeleton)}`,
);
