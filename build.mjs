// Merge a project's skeleton and semantic layer into one self-contained page, plus a
// compact text version of the map for the chat agent.
// Usage: node build.mjs <project>   (reads <project>/.atlas, writes <project>/.atlas/out)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const tool = path.dirname(new URL(import.meta.url).pathname);
const PROJECT = path.resolve(process.argv[2] || '.');
const A = path.join(PROJECT, '.atlas');
const OUT = path.join(A, 'out');
const readJson = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);
const load = async (f) => (fs.existsSync(path.join(A, f)) ? import(pathToFileURL(path.join(A, f)).href) : {});

const config = readJson(path.join(A, 'atlas.config.json'));
const sk = readJson(path.join(OUT, 'skeleton.json'));
// The semantic layer is optional: base language in semantic.mjs, English twins in semantic_en.mjs.
const Sm = await load('semantic.mjs'), EN = await load('semantic_en.mjs');
const S = {
  system: Sm.system || {}, caps: Sm.caps || [], desc: Sm.desc || {}, legacy: Sm.legacy || {}, legacyStatus: Sm.legacyStatus || {},
  invariants: Sm.invariants || [], decisions: Sm.decisions || [], concepts: Sm.concepts || [], flows: [...(Sm.flows || [])],
};
const ids = new Set(sk.nodes.map((n) => n.id));

const problems = [];
const check = (id, where) => { if (!ids.has(id)) problems.push(`${where}: ${id}`); };

for (const n of sk.nodes) {
  n.hash = crypto.createHash('sha1').update(n.files.map((f) => f.hash).join('')).digest('hex').slice(0, 8);
  if (n.kind === 'module') n.cap = S.caps.find((c) => c.rules.some((r) => r.test(n.id)))?.id ?? null;
  if (S.desc[n.id]) n.desc = { ...S.desc[n.id], describedHash: S.desc[n.id].describedHash ?? n.hash };
  if (S.legacyStatus[n.id]) n.legacy = S.legacyStatus[n.id];
}
// Descriptions written by the agent (module + files), kept while their code is unchanged.
const gen = readJson(path.join(A, 'descriptions.local.json'), { nodes: {}, files: {} });
for (const n of sk.nodes) {
  if (!n.desc && gen.nodes[n.id]) n.desc = gen.nodes[n.id];
  if (n.desc) n.stale = n.desc.describedHash !== n.hash;
  for (const f of n.files) if (gen.files[f.path]) { f.desc = gen.files[f.path]; f.stale = f.desc.describedHash !== f.hash; }
}
for (const id of Object.keys(S.desc)) check(id, 'desc');
for (const id of Object.keys(S.legacyStatus)) check(id, 'legacy');
for (const i of S.invariants) i.scope.forEach((id) => check(id, `invariant ${i.id}`));
for (const d of S.decisions) d.units.forEach((id) => check(id, `decision ${d.id}`));
for (const c of S.concepts) [...c.owner, ...c.writes, ...c.reads].forEach((id) => check(id, `concept ${c.id}`));
for (const f of S.flows) f.steps.forEach((s) => check(s.unit, `flow ${f.id}`));
if (problems.length) { console.error('unknown ids:\n' + problems.join('\n')); process.exit(1); }
const unmapped = S.caps.length ? sk.nodes.filter((n) => n.kind === 'module' && !n.cap).map((n) => n.id) : [];
if (unmapped.length) console.error(`modules without a capability: ${unmapped.length}\n  ${unmapped.join('\n  ')}`);

// Attach English text as `<field>_en` next to the base-language original.
const tr = (o, t) => { if (o && t) for (const [k, v] of Object.entries(t)) if (typeof v === 'string') o[k + '_en'] = v; };
tr(S.system, EN.system);
for (const n of sk.nodes) if (n.desc) { tr(n.desc, EN.desc?.[n.id]); n.desc.anchors?.forEach((a) => { if (EN.anchorNotes?.[a.note]) a.note_en = EN.anchorNotes[a.note]; }); }
for (const c of S.caps) tr(c, EN.caps?.[c.id]);
for (const [k, v] of Object.entries(S.legacy)) tr(v, EN.legacy?.[k]);
for (const i of S.invariants) tr(i, EN.invariants?.[i.id]);
for (const d of S.decisions) tr(d, EN.decisions?.[d.id]);
for (const c of S.concepts) tr(c, EN.concepts?.[c.id]);
for (const f of S.flows) { tr(f, EN.flows?.[f.id]); if (EN.flows?.[f.id]) f.steps.forEach((st, i) => { st.text_en = EN.flows[f.id].steps[i]; }); }
// Flows documented from the chat already carry both languages.
for (const f of readJson(path.join(A, 'flows.local.json'), [])) {
  const bad = f.steps.filter((st) => !ids.has(st.unit)).map((st) => st.unit);
  if (bad.length) { console.error(`flow ${f.id}: unknown units ${bad.join(', ')}; dropped those steps`); f.steps = f.steps.filter((st) => ids.has(st.unit)); }
  S.flows.push({ ...f, local: true });
}

const data = {
  config: {
    name: config.name, lang: config.language || 'en', languages: config.languages || [config.language || 'en'],
    sources: config.sources.map(({ id, name, dir, color, role }) => ({ id, name: name || dir, color, role: role || null })),
    suggestions: config.chat?.suggestions || {},
  },
  system: S.system,
  generatedAt: sk.generatedAt,
  nodes: sk.nodes, edges: sk.edges,
  caps: S.caps.map(({ rules, ...c }) => c),
  invariants: S.invariants, decisions: S.decisions, concepts: S.concepts, flows: S.flows, legacy: S.legacy,
};

const V = path.join(tool, 'vendor/three');
const page = fs.readFileSync(path.join(tool, 'template3d.html'), 'utf8')
  .replace('/*__THREE__*/', () => fs.readFileSync(path.join(V, 'three.min.js'), 'utf8'))
  .replace('/*__ORBIT__*/', () => fs.readFileSync(path.join(V, 'OrbitControls.js'), 'utf8'))
  .replace('/*__CSS2D__*/', () => fs.readFileSync(path.join(V, 'CSS2DRenderer.js'), 'utf8'))
  .replace('/*__DATA__*/null', () => JSON.stringify(data));
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'atlas.html'), page);

// Compact text version of the map for the chat agent to read first.
const capName = Object.fromEntries(S.caps.map((c) => [c.id, c.name_en || c.name]));
const en = (o, k) => o?.[k + '_en'] || o?.[k] || '';
const agg = (pred, key) => {
  const m = {};
  for (const e of sk.edges) if (pred(e)) m[e[key]] = (m[e[key]] || 0) + e.w;
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, w]) => `${k} (${w})`).join(', ');
};
const dirOf = (files) => {
  const parts = files.map((f) => f.path.split('/'));
  const out = [];
  for (let i = 0; parts.every((p) => p.length > i + 1 && p[i] === parts[0][i]); i++) out.push(parts[0][i]);
  return out.join('/');
};
const L = [`# Atlas — ${config.name}`, '', `Generated ${sk.generatedAt}. Paths are relative to the project root (the cwd).`, ''];
if (S.system.tech || S.system.biz) L.push(en(S.system, 'tech'), en(S.system, 'biz'), '');
L.push('## Sources (repos)');
for (const n of sk.nodes.filter((x) => x.kind === 'repo')) L.push(`- ${n.id}: ${n.name} @ ${n.branch} ${n.sha}${n.role ? ` (${n.role})` : ''} ${n.desc ? '— ' + en(n.desc, 'tech') : ''}`);
if (S.caps.length) {
  L.push('', '## Capabilities (semantic grouping of modules)');
  for (const c of S.caps) L.push(`- cap:${c.id} — ${en(c, 'name')}: ${en(c, 'tech')}`, `  modules: ${sk.nodes.filter((n) => n.cap === c.id).map((n) => n.id).join(', ')}`);
}
L.push('', '## Modules', 'Format: id · directory · lines · capability · status. Then description, evidence, dependencies (weight = import count).', '');
for (const n of sk.nodes.filter((x) => x.kind === 'module')) {
  const flags = [n.stale ? 'STALE description' : null, n.legacy ? `legacy:${n.legacy}` : null].filter(Boolean).join(', ');
  L.push(`### ${n.id}`, `${dirOf(n.files)} · ${n.loc} lines${n.cap ? ' · ' + capName[n.cap] : ''}${flags ? ' · ' + flags : ''}`);
  if (n.desc) L.push(`${en(n.desc, 'tech')} ${n.desc.biz ? '— ' + en(n.desc, 'biz') : ''} [${n.desc.confidence}]`);
  if (n.desc?.anchors) L.push(`evidence: ${n.desc.anchors.map((a) => `${a.path}:${a.line} (${a.note})`).join('; ')}`);
  const uses = agg((e) => e.from === n.id, 'to'), usedBy = agg((e) => e.to === n.id, 'from');
  if (uses) L.push(`uses: ${uses}`);
  if (usedBy) L.push(`used by: ${usedBy}`);
  L.push(`files: ${n.files.map((f) => f.path.split('/').pop()).join(', ')}`, '');
}
if (S.flows.length) {
  L.push('## Flows');
  for (const f of S.flows) { L.push(`### flow:${f.id} — ${en(f, 'name')} [${f.confidence}]`); f.steps.forEach((s, i) => L.push(`${i + 1}. ${s.unit} — ${en(s, 'text')}${s.anchor ? ` (${s.anchor})` : ''}`)); L.push(''); }
}
if (S.invariants.length) { L.push('## Invariants'); for (const i of S.invariants) L.push(`- ${en(i, 'name')} — guard: ${i.guard} (${i.guardPath}) — scope: ${i.scope.join(', ')}`); L.push(''); }
if (S.decisions.length) { L.push('## Decisions'); for (const d of S.decisions) L.push(`- ${d.id} ${en(d, 'name')} — ${d.path}`); L.push(''); }
if (Object.keys(S.legacy).length) { L.push('## Legacy statuses'); for (const [k, v] of Object.entries(S.legacy)) L.push(`- ${k}: ${en(v, 'note')}`); }
fs.writeFileSync(path.join(OUT, 'atlas-context.md'), L.join('\n'));
console.error(`build: ${path.relative(PROJECT, OUT)}/atlas.html, atlas-context.md (${L.length} lines)`);
