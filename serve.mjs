// Local server: serves a project's map and answers chat questions by running the user's
// own Claude Code headless in the project, read-only, with the map as context.
// Usage: node serve.mjs <project> [port]   (the project has a .atlas folder; see README)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const tool = path.dirname(new URL(import.meta.url).pathname);
const WORKSPACE = path.resolve(process.argv[2] || '.');
const PORT = +(process.argv[3] || 4317);
const STORE = path.join(WORKSPACE, '.atlas');
const OUT = path.join(STORE, 'out');
const CONTEXT = path.join(OUT, 'atlas-context.md');
const rebuild = () => spawn('node', [path.join(tool, 'build.mjs'), WORKSPACE], { stdio: ['ignore', 'ignore', 'pipe'] });

const system = (lang, about) => `You are Atlas, the architecture guide for the codebase in the current directory (several repos side by side).
Before answering, read ${CONTEXT} — the architecture map: capabilities, modules with descriptions and dependencies, flows, invariants and decisions.
Rules:
- Ground every claim. Prefer the map; when it is not enough, or a description is marked STALE or [inferred], read the code (Read/Grep/Glob) and say so. Cite code as path:line.
- Refer to modules with their exact atlas id in double brackets, e.g. [[web/api/orders]]. Capabilities: [[cap:billing]]. Never invent ids.
- Be concise: a short answer first, then detail only if it helps. Plain markdown, no headings.
- If your answer points at specific modules, end with one last line: SHOW: id1, id2, ... (atlas ids, most relevant first, max 12). The viewer lights these up in 3D.
- Answer in ${lang === 'pt' ? 'Brazilian Portuguese' : 'English'}.
Documenting a flow (writing down a named, step-by-step path through EXISTING code, like the ones under "## Flows" in the map — never a new feature):
- If the user wants to document a flow but hasn't said which, propose 3–4 important flows that already exist in the code but are NOT in the map yet (one line each, with the modules they cross) and ask which one.
- Once you know which, trace it in the code. Every step must name an existing module id from the map and an anchor path:line you actually read. Keep it to 4–10 steps.
- Then output exactly one fenced block, nothing after it except the SHOW line:
\`\`\`atlas-flow
{"id":"kebab-id","name_en":"…","name_pt":"…","biz_en":"one sentence, plain language","biz_pt":"…","confidence":"verified","steps":[{"unit":"module-id","text_en":"…","text_pt":"…","anchor":"path:line"}]}
\`\`\`
  Use "inferred" for confidence if any step lacks an anchor you read. The viewer previews it in 3D and the user decides whether to save it.
${about ? `The viewer is currently looking at ${about}; "this"/"isso" refers to it.` : ''}`;

const toolStatus = (b) => {
  const i = b.input || {};
  const p = i.file_path || i.path || '';
  if (b.name === 'Read') return `read ${p.replace(WORKSPACE + '/', '')}`;
  if (b.name === 'Grep') return `grep "${i.pattern}"${p ? ' in ' + p.replace(WORKSPACE + '/', '') : ''}`;
  if (b.name === 'Glob') return `glob ${i.pattern}`;
  return b.name;
};

function chat(req, res, body) {
  const { message, session, lang, about } = body;
  res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache' });
  const send = (o) => res.write(JSON.stringify(o) + '\n');
  const args = ['-p', message, '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    // Only read tools exist for this agent; no MCP servers, so it starts fast and can't wander.
    '--tools', 'Read', 'Grep', 'Glob', '--allowedTools', 'Read', 'Grep', 'Glob', '--strict-mcp-config', '--effort', 'medium',
    '--append-system-prompt', system(lang, about)];
  if (session) args.push('--resume', session);
  const child = spawn('claude', args, { cwd: WORKSPACE, stdio: ['ignore', 'pipe', 'pipe'] });
  let buf = '';
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      let ev; try { ev = JSON.parse(line); } catch { continue; }
      if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta') send({ type: 'delta', text: ev.event.delta.text });
      else if (ev.type === 'assistant') for (const b of ev.message?.content || []) { if (b.type === 'tool_use') send({ type: 'status', text: toolStatus(b) }); }
      else if (ev.type === 'result') send({ type: 'done', text: ev.result || '', session: ev.session_id, error: ev.is_error ? ev.subtype : null });
    }
  });
  child.stderr.on('data', (d) => process.stderr.write(d));
  child.on('close', () => res.end());
  // The browser going away (not the request body ending) is what should stop the agent.
  res.on('close', () => { if (!res.writableEnded) child.kill(); });
}

// Descriptions written on demand: when someone opens a module that has none, the agent reads
// its files and describes the module and each file. Cached in descriptions.local.json.
const DESCS = path.join(STORE, 'descriptions.local.json');
const loadDescs = () => (fs.existsSync(DESCS) ? JSON.parse(fs.readFileSync(DESCS, 'utf8')) : { nodes: {}, files: {} });
function describe(res, id) {
  const sk = JSON.parse(fs.readFileSync(path.join(OUT, 'skeleton.json'), 'utf8'));
  const mod = sk.nodes.find((n) => n.id === id && n.kind === 'module');
  if (!mod) { res.writeHead(404); return res.end(); }
  const ctx = fs.readFileSync(CONTEXT, 'utf8');
  const start = ctx.indexOf(`### ${id}\n`);
  const section = start >= 0 ? ctx.slice(start, ctx.indexOf('\n###', start + 4)) : '';
  const hasModule = /\[(verified|inferred|generated)\]/.test(section);
  const prompt = `Describe one module of this codebase for an architecture map.
Module id: ${id}
What the map already says about it:
${section}
Files (paths relative to the current directory):
${mod.files.map((f) => '- ' + f.path).join('\n')}

Read every file. Then output ONLY one fenced block and nothing else:
\`\`\`atlas-desc
{${hasModule ? '' : '"module":{"biz_en":"…","biz_pt":"…","tech_en":"…","tech_pt":"…"},'}"files":{"<path>":{"biz_en":"…","biz_pt":"…","tech_en":"…","tech_pt":"…"}}}
\`\`\`
biz: one plain sentence on what it is for, for someone who doesn't read code.
tech: one or two sentences on how it does it, naming the key functions, routes or components.
_pt fields in Brazilian Portuguese. Use the file paths exactly as listed.`;
  const child = spawn('claude', ['-p', prompt, '--output-format', 'json', '--tools', 'Read', '--allowedTools', 'Read', '--strict-mcp-config',
    '--model', 'sonnet', '--effort', 'low'], { cwd: WORKSPACE, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => process.stderr.write(d));
  child.on('close', () => {
    try {
      const text = JSON.parse(out).result || '';
      // tolerate a missing or differently-labelled fence: take the outermost JSON object
      const m = text.match(/\`\`\`(?:atlas-desc|json)?\s*([\s\S]*?)\`\`\`/);
      const body = m ? m[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
      const got = JSON.parse(body);
      const map = (o) => o && { biz: o.biz_pt, biz_en: o.biz_en, tech: o.tech_pt, tech_en: o.tech_en, confidence: 'generated' };
      const all = loadDescs();
      // same module hash the build computes, so the description reads as fresh
      const modHash = crypto.createHash('sha1').update(mod.files.map((f) => f.hash).join('')).digest('hex').slice(0, 8);
      if (got.module) all.nodes[id] = { ...map(got.module), describedHash: modHash };
      const files = {};
      for (const f of mod.files) if (got.files?.[f.path]) files[f.path] = all.files[f.path] = { ...map(got.files[f.path]), describedHash: f.hash };
      fs.writeFileSync(DESCS, JSON.stringify(all, null, 2));
      rebuild(); // so a reload keeps them
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ module: all.nodes[id] && got.module ? all.nodes[id] : null, files }));
    } catch (e) { process.stderr.write(`describe ${id} failed: ${e}\n${out.slice(-400)}\n`); res.writeHead(500); res.end(String(e)); }
  });
}

// Saved flows are kept next to the semantic layer and the page is rebuilt.
const FLOWS = path.join(STORE, 'flows.local.json');
function saveFlow(res, flow) {
  const all = fs.existsSync(FLOWS) ? JSON.parse(fs.readFileSync(FLOWS, 'utf8')) : [];
  const i = all.findIndex((f) => f.id === flow.id);
  if (i >= 0) all[i] = flow; else all.push(flow);
  fs.writeFileSync(FLOWS, JSON.stringify(all, null, 2));
  const b = rebuild();
  let err = '';
  b.stderr.on('data', (d) => (err += d));
  b.on('close', (code) => { res.writeHead(code ? 500 : 200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: !code, log: err.trim().split('\n').slice(-3) })); });
}

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/describe') {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => { try { describe(res, JSON.parse(raw).id); } catch (e) { res.writeHead(400); res.end(String(e)); } });
    return;
  }
  if (req.method === 'POST' && req.url === '/flows') {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => { try { saveFlow(res, JSON.parse(raw)); } catch (e) { res.writeHead(400); res.end(String(e)); } });
    return;
  }
  if (req.method === 'POST' && req.url === '/chat') {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => { try { chat(req, res, JSON.parse(raw)); } catch (e) { res.writeHead(400); res.end(String(e)); } });
    return;
  }
  if (req.url !== '/') { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  fs.createReadStream(path.join(OUT, 'atlas.html')).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`atlas: http://127.0.0.1:${PORT}  (project ${WORKSPACE})`));
