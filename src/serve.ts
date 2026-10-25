// Local server: serves a project's map and answers chat questions by running the user's
// own Claude Code headless in the project, read-only, with the map as context.
// Usage: node src/serve.ts <project> [port]   (the project has a .atlas folder; see README)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import type {
  ChatEvent,
  ChatRequest,
  Desc,
  DescribeRequest,
  DescribeResponse,
  DescriptionsStore,
  Flow,
  Lang,
  SaveFlowResponse,
  Skeleton,
} from './types.ts';

const here = path.dirname(new URL(import.meta.url).pathname);
const PROJECT = path.resolve(process.argv[2] || '.');
const PORT = +(process.argv[3] || 4317);
const STORE = path.join(PROJECT, '.atlas');
const OUT = path.join(STORE, 'out');
const CONTEXT = path.join(OUT, 'atlas-context.md');
const DESCS = path.join(STORE, 'descriptions.local.json');
const FLOWS = path.join(STORE, 'flows.local.json');
const rebuild = () =>
  spawn(process.execPath, [path.join(here, 'build.ts'), PROJECT], { stdio: ['ignore', 'ignore', 'pipe'] });
const readJson = <T>(p: string, fallback: T): T =>
  fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback;

const system = (
  lang: Lang,
  about: string | null,
) => `You are Atlas, the architecture guide for the codebase in the current directory (several repos side by side).
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

// The parts of Claude Code's stream-json output this server reads.
type ToolUse = {
  type: 'tool_use';
  name: string;
  input?: { file_path?: string; path?: string; pattern?: string };
};
type AgentEvent =
  | { type: 'stream_event'; event?: { type?: string; delta?: { type?: string; text?: string } } }
  | { type: 'assistant'; message?: { content?: (ToolUse | { type: string })[] } }
  | { type: 'result'; result?: string; session_id?: string; is_error?: boolean; subtype?: string };

const toolStatus = (b: ToolUse) => {
  const p = (b.input?.file_path || b.input?.path || '').replace(PROJECT + '/', '');
  if (b.name === 'Read') return `read ${p}`;
  if (b.name === 'Grep') return `grep "${b.input?.pattern}"${p ? ' in ' + p : ''}`;
  if (b.name === 'Glob') return `glob ${b.input?.pattern}`;
  return b.name;
};

function chat(res: http.ServerResponse, { message, session, lang, about }: ChatRequest) {
  res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache' });
  const send = (e: ChatEvent) => res.write(JSON.stringify(e) + '\n');
  const args = [
    '-p',
    message,
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    // Only read tools exist for this agent; no MCP servers, so it starts fast and can't wander.
    '--tools',
    'Read',
    'Grep',
    'Glob',
    '--allowedTools',
    'Read',
    'Grep',
    'Glob',
    '--strict-mcp-config',
    '--effort',
    'medium',
    '--append-system-prompt',
    system(lang, about),
  ];
  if (session) args.push('--resume', session);
  const child = spawn('claude', args, { cwd: PROJECT, stdio: ['ignore', 'pipe', 'pipe'] });
  let buf = '';
  child.stdout.on('data', (chunk: Buffer) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      let ev: AgentEvent;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (
        ev.type === 'stream_event' &&
        ev.event?.type === 'content_block_delta' &&
        ev.event.delta?.type === 'text_delta'
      )
        send({ type: 'delta', text: ev.event.delta.text ?? '' });
      else if (ev.type === 'assistant') {
        for (const b of ev.message?.content ?? [])
          if (b.type === 'tool_use') send({ type: 'status', text: toolStatus(b as ToolUse) });
      } else if (ev.type === 'result')
        send({
          type: 'done',
          text: ev.result || '',
          session: ev.session_id,
          error: ev.is_error ? (ev.subtype ?? 'error') : null,
        });
    }
  });
  child.stderr.on('data', (d: Buffer) => process.stderr.write(d));
  child.on('close', () => res.end());
  // The browser going away (not the request body ending) is what should stop the agent.
  res.on('close', () => {
    if (!res.writableEnded) child.kill();
  });
}

// Descriptions written on demand: when someone opens a module that has none, the agent reads
// its files and describes the module and each file. Cached in descriptions.local.json.
type DescDraft = { biz_en?: string; biz_pt?: string; tech_en?: string; tech_pt?: string };
const toDesc = (o: DescDraft, describedHash: string): Desc => ({
  biz: o.biz_pt,
  biz_en: o.biz_en,
  tech: o.tech_pt,
  tech_en: o.tech_en,
  confidence: 'generated',
  describedHash,
});

function describe(res: http.ServerResponse, { id }: DescribeRequest) {
  const sk = readJson<Skeleton>(path.join(OUT, 'skeleton.json'), { generatedAt: '', nodes: [], edges: [] });
  const mod = sk.nodes.find((n) => n.id === id && n.kind === 'module');
  if (!mod) {
    res.writeHead(404);
    res.end();
    return;
  }
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
  const child = spawn(
    'claude',
    [
      '-p',
      prompt,
      '--output-format',
      'json',
      '--tools',
      'Read',
      '--allowedTools',
      'Read',
      '--strict-mcp-config',
      '--model',
      'sonnet',
      '--effort',
      'low',
    ],
    { cwd: PROJECT, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let out = '';
  child.stdout.on('data', (d: Buffer) => (out += d));
  child.stderr.on('data', (d: Buffer) => process.stderr.write(d));
  child.on('close', () => {
    try {
      const text: string = JSON.parse(out).result || '';
      // tolerate a missing or differently-labelled fence: take the outermost JSON object
      const m = text.match(/```(?:atlas-desc|json)?\s*([\s\S]*?)```/);
      const got: { module?: DescDraft; files?: Record<string, DescDraft> } = JSON.parse(
        m ? m[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1),
      );
      const all = readJson<DescriptionsStore>(DESCS, { nodes: {}, files: {} });
      // same module hash the build computes, so the description reads as fresh
      const modHash = crypto
        .createHash('sha1')
        .update(mod.files.map((f) => f.hash).join(''))
        .digest('hex')
        .slice(0, 8);
      if (got.module) all.nodes[id] = toDesc(got.module, modHash);
      const files: Record<string, Desc> = {};
      for (const f of mod.files) {
        const g = got.files?.[f.path];
        if (g) files[f.path] = all.files[f.path] = toDesc(g, f.hash);
      }
      fs.writeFileSync(DESCS, JSON.stringify(all, null, 2));
      rebuild(); // so a reload keeps them
      const body: DescribeResponse = { module: got.module ? all.nodes[id] : null, files };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    } catch (e) {
      process.stderr.write(`describe ${id} failed: ${e}\n${out.slice(-400)}\n`);
      res.writeHead(500);
      res.end(String(e));
    }
  });
}

// Saved flows are kept next to the semantic layer and the page is rebuilt.
function saveFlow(res: http.ServerResponse, flow: Flow) {
  const all = readJson<Flow[]>(FLOWS, []);
  const i = all.findIndex((f) => f.id === flow.id);
  if (i >= 0) all[i] = flow;
  else all.push(flow);
  fs.writeFileSync(FLOWS, JSON.stringify(all, null, 2));
  const b = rebuild();
  let err = '';
  b.stderr.on('data', (d: Buffer) => (err += d));
  b.on('close', (code) => {
    const body: SaveFlowResponse = { ok: !code, log: err.trim().split('\n').slice(-3) };
    res.writeHead(code ? 500 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });
}

const routes: Record<string, (res: http.ServerResponse, body: never) => void> = {
  '/chat': chat,
  '/describe': describe,
  '/flows': saveFlow,
};

http
  .createServer((req, res) => {
    const route = req.method === 'POST' ? routes[req.url ?? ''] : undefined;
    if (route) {
      let raw = '';
      req.on('data', (d: Buffer) => (raw += d));
      req.on('end', () => {
        try {
          route(res, JSON.parse(raw) as never);
        } catch (e) {
          res.writeHead(400);
          res.end(String(e));
        }
      });
      return;
    }
    if (req.url !== '/') {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(OUT, 'atlas.html')).pipe(res);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`atlas: http://127.0.0.1:${PORT}  (project ${PROJECT})`));
